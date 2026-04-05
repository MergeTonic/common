"""GitHub Action entry: PR summary + optional file/inline comments."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

from .github_api import (
    create_pull_request,
    get_pull_request,
    list_pull_review_comments,
    post_pull_review_comment,
    upsert_issue_comment,
)
from .github_comments import (
    CommentMode,
    Verbosity,
    build_file_top_comment,
    build_inline_thread_comment,
    build_orphan_inline_thread_comment,
    build_summary_body,
    file_upsert_prefix,
    marker_inline,
    marker_orphan,
    summary_upsert_prefix,
)
from .head_line_map import conflict_region_to_head_span_result
from .hydrate import hydrate_pr_files
from .git_merge_hydration import git_merge_hydration_from_env
from .hydrate_git_merge import hydrate_git_merge
from .marker_branch import push_tonic_marker_branch
from .labels import apply_pr_labels_to_conflict_file
from .merge import annotated_to_conflict_file, merge_snapshots
from .merge_llm_hydration_context import build_merge_llm_hydration_appendix
from .models import ConflictRegion, MergeArtifact, merge_report_dict
from .suggestions import (
    build_github_suggestion_body,
    build_unified_diff,
    heuristic_resolved_lines,
    parse_resolved_lines_from_ai,
    suggestion_line_count_ok,
)


def _load_event() -> dict:
    path = os.environ.get("GITHUB_EVENT_PATH")
    if not path or not os.path.isfile(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _load_pr_from_json_file() -> dict | None:
    path = os.environ.get("TONIC_PULL_REQUEST_JSON", "").strip()
    if not path or not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else None


def _resolve_pr_for_agent(event: dict, owner: str, repo_name: str, token: str | None) -> dict:
    """Build pull_request-shaped dict from webhook or TONIC_PULL_REQUEST_JSON or REST API."""
    pr = event.get("pull_request")
    if isinstance(pr, dict) and pr.get("number"):
        return pr
    cached = _load_pr_from_json_file()
    if isinstance(cached, dict) and cached.get("number"):
        return cached
    issue = event.get("issue")
    if token and isinstance(issue, dict) and issue.get("pull_request") is not None:
        num = issue.get("number")
        if isinstance(num, int) and num > 0:
            return get_pull_request(owner, repo_name, num, token)
        if isinstance(num, str) and num.isdigit():
            return get_pull_request(owner, repo_name, int(num), token)
    return {}


def _truthy(val: str | None) -> bool:
    if not val:
        return False
    return val.strip().lower() in ("1", "true", "yes", "on")


def _get_ai_provider(enable: bool):
    if not enable:
        return None
    try:
        from .ai_resolution import build_openai_stack

        p = build_openai_stack()
        return p if p.is_available() else None
    except Exception:  # noqa: BLE001
        return None


def _annotated_region_snippet(annotated: list[str], reg: ConflictRegion) -> str:
    sl = max(0, reg.start_line - 1)
    el = min(len(annotated), reg.end_line)
    return "\n".join(annotated[sl:el])


def _resolved_lines_for_region(cf, reg, provider, *, hydration_appendix: str = ""):
    if provider:
        try:
            resp = provider.resolve_conflict(
                cf, reg, hydration_appendix=hydration_appendix
            )
            lines, rat = parse_resolved_lines_from_ai(resp.content)
            if lines:
                return lines, rat, True
        except Exception:  # noqa: BLE001
            pass
    return heuristic_resolved_lines(reg), None, False


def _ai_note_for_file(cf, enable: bool) -> str | None:
    if not enable or not cf.conflicts:
        return None
    try:
        provider = _get_ai_provider(True)
        if not provider:
            return None
        parts: list[str] = []
        for i, reg in enumerate(cf.conflicts[:5]):
            resp = provider.resolve_conflict(cf, reg, hydration_appendix="")
            lines, rat = parse_resolved_lines_from_ai(resp.content)
            preview = "\n".join(lines) if lines else resp.content
            note = preview[:2000]
            if rat:
                note += f"\n_{rat}_\n"
            parts.append(f"**Region {i + 1} ({reg.conflict_kind}):**\n{note}\n")
        return "\n".join(parts)
    except Exception as exc:  # noqa: BLE001
        return f"_(AI unavailable: {exc})_"


def _run_demo_local(verbosity: Verbosity, run_id: str) -> None:
    title = "local-demo"
    left = os.environ.get("TONIC_AGENT_DEMO_LEFT", "A\nB\n").splitlines()
    right = os.environ.get("TONIC_AGENT_DEMO_RIGHT", "A\nX\nB\n").splitlines()
    merged, annotated = merge_snapshots(left, right)
    cf = annotated_to_conflict_file("demo.txt", annotated)
    files_payload = [
        {
            "path": "demo.txt",
            "merged_line_count": len(merged),
            "conflict_regions": len(cf.conflicts),
            "markers_present": any(ln.startswith("<<<<<<< begin") for ln in annotated),
        }
    ]
    summary = build_summary_body(run_id, title, files_payload, verbosity=verbosity)
    print(summary)


def _write_action_outputs(
    *,
    status: str,
    files_analyzed: int,
    conflicted_files: int,
    report_path: str | None,
) -> None:
    out_path = os.environ.get("GITHUB_OUTPUT", "").strip()
    if not out_path:
        return
    lines = [
        f"status={status}",
        f"files_analyzed={files_analyzed}",
        f"conflicted_files={conflicted_files}",
        f"report_path={report_path or ''}",
    ]
    try:
        with open(out_path, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    except OSError:
        pass


@dataclass
class ImmutableTargets:
    base_sha: str
    head_sha: str
    base_branch: str
    source_pr_number: int


@dataclass
class PublishContext:
    source_pr_number: int
    target_pr_number: int
    target_head_sha: str
    target_base_branch: str
    source_head_sha: str


def _run_git(cwd: str, args: list[str], *, allow_fail: bool = False) -> str:
    cp = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
    )
    if cp.returncode != 0 and not allow_fail:
        raise RuntimeError(cp.stderr.strip() or cp.stdout.strip() or f"git {' '.join(args)} failed")
    return (cp.stdout or "") + ("\n" + cp.stderr if cp.stderr else "")


def _load_immutable_targets(pr: dict, *, allow_event_fallback: bool = False) -> ImmutableTargets:
    missing: list[str] = []
    env_base_sha = os.environ.get("TONIC_TARGET_BASE_SHA", "").strip()
    env_head_sha = os.environ.get("TONIC_TARGET_HEAD_SHA", "").strip()
    env_base_branch = os.environ.get("TONIC_TARGET_BASE_BRANCH", "").strip()
    base = pr.get("base") or {}
    head = pr.get("head") or {}
    event_base_sha = base.get("sha") if isinstance(base.get("sha"), str) else ""
    event_head_sha = head.get("sha") if isinstance(head.get("sha"), str) else ""
    event_base_branch = base.get("ref") if isinstance(base.get("ref"), str) else ""
    base_sha = env_base_sha or (event_base_sha if allow_event_fallback else "")
    head_sha = env_head_sha or (event_head_sha if allow_event_fallback else "")
    base_branch = env_base_branch or (event_base_branch if allow_event_fallback else "")
    if not base_sha:
        missing.append("TONIC_TARGET_BASE_SHA")
    if not head_sha:
        missing.append("TONIC_TARGET_HEAD_SHA")
    if not base_branch:
        missing.append("TONIC_TARGET_BASE_BRANCH")
    if missing:
        raise RuntimeError(f"missing immutable target contract keys: {', '.join(missing)}")
    if env_base_sha and isinstance(base.get("sha"), str) and base.get("sha") and base.get("sha") != base_sha:
        raise RuntimeError("TONIC_TARGET_BASE_SHA does not match pull_request.base.sha")
    if env_head_sha and isinstance(head.get("sha"), str) and head.get("sha") and head.get("sha") != head_sha:
        raise RuntimeError("TONIC_TARGET_HEAD_SHA does not match pull_request.head.sha")
    source_pr_number = int(pr.get("number") or 0)
    if source_pr_number <= 0:
        raise RuntimeError("pull_request.number is required")
    return ImmutableTargets(
        base_sha=base_sha,
        head_sha=head_sha,
        base_branch=base_branch,
        source_pr_number=source_pr_number,
    )


def _validate_completion_readiness(pairs: dict) -> None:
    if pairs is None:
        raise RuntimeError("completion gate failed: missing hydrate result")


def _assert_target_context(ctx: PublishContext) -> None:
    if ctx.source_pr_number == ctx.target_pr_number:
        raise RuntimeError("publish context swap failed: source and target PR are identical")
    if not ctx.target_head_sha:
        raise RuntimeError("publish context swap failed: missing target head sha")


def _orchestrate_run_pr(
    *,
    workspace: str,
    owner: str,
    repo: str,
    token: str,
    run_id: str,
    source_pr_number: int,
    target_base_branch: str,
    base_sha: str,
    head_sha: str,
    title: str,
) -> tuple[int, str]:
    branch_name = _run_git(workspace, ["branch", "--show-current"]).strip()
    if not branch_name:
        raise RuntimeError("isolated branch name is empty")
    payload_dir = Path(workspace) / ".tonic-agent" / "runs"
    payload_dir.mkdir(parents=True, exist_ok=True)
    payload_path = payload_dir / f"{run_id}.json"
    payload_path.write_text(
        json.dumps(
            {
                "run_id": run_id,
                "source_pr_number": source_pr_number,
                "target_base_branch": target_base_branch,
                "target_base_sha": base_sha,
                "target_head_sha": head_sha,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    _run_git(workspace, ["add", ".tonic-agent/runs"])
    _run_git(workspace, ["commit", "-m", f"tonic: isolated run context {run_id}"], allow_fail=False)
    _run_git(workspace, ["push", "-u", "origin", f"HEAD:{branch_name}"])
    pr_number, pr_head_sha = create_pull_request(
        owner,
        repo,
        token,
        title=f"Tonic isolated run for #{source_pr_number}: {title}",
        head=branch_name,
        base=target_base_branch,
        body="\n".join(
            [
                "## Tonic Isolated Run",
                "",
                f"- run_id: {run_id}",
                f"- source_pr: #{source_pr_number}",
                f"- target_base_branch: {target_base_branch}",
                f"- target_base_sha: {base_sha}",
                f"- target_head_sha: {head_sha}",
            ]
        ),
    )
    return pr_number, pr_head_sha


def main() -> None:
    token = os.environ.get("INPUT_TOKEN") or os.environ.get("GITHUB_TOKEN")
    comment_mode = os.environ.get("INPUT_COMMENT_MODE", "all")
    verbosity_s = os.environ.get("INPUT_VERBOSITY", "medium")
    max_inline = int(os.environ.get("INPUT_MAX_INLINE_COMMENTS_PER_FILE", "20") or "20")
    try:
        max_suggestion_lines = int(
            os.environ.get("INPUT_MAX_SUGGESTION_LINES", "200") or "200"
        )
    except ValueError:
        max_suggestion_lines = 200
    if max_suggestion_lines == 0:
        max_suggestion_lines = int(10**18)
    hydrate_mode = os.environ.get("INPUT_HYDRATE_MODE", "pr-diff")
    merge_engine = os.environ.get("INPUT_MERGE_ENGINE", "git")
    if merge_engine == "gitmerge":
        merge_engine = "git"
    enable_ai = _truthy(os.environ.get("INPUT_ENABLE_AI"))
    enable_checks = _truthy(os.environ.get("INPUT_ENABLE_CHECKS"))
    enable_blame = _truthy(os.environ.get("INPUT_ENABLE_BLAME"))
    try:
        blame_max_commits = int(os.environ.get("INPUT_BLAME_MAX_COMMITS", "3") or "3")
    except ValueError:
        blame_max_commits = 3
    max_files = int(os.environ.get("TONIC_AGENT_MAX_FILES", "200") or "200")
    report_path = os.environ.get("TONIC_AGENT_REPORT_PATH", "").strip()
    isolated_workspace = os.environ.get("TONIC_AGENT_ISOLATED_WORKSPACE", "").strip()

    try:
        verbosity = Verbosity(verbosity_s)
    except ValueError:
        verbosity = Verbosity.MEDIUM

    try:
        mode = CommentMode(comment_mode)
    except ValueError:
        mode = CommentMode.ALL

    run_id = os.environ.get("GITHUB_RUN_ID") or str(uuid.uuid4())
    event = _load_event()
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    owner = ""
    name = ""
    if repo and "/" in repo:
        owner, name = repo.split("/", 1)
    pr = _resolve_pr_for_agent(event, owner, name, token) if (owner and name) else {}
    title = pr.get("title") or "PR"
    number = pr.get("number")

    if not number or not repo or not token:
        _run_demo_local(verbosity, run_id)
        _write_action_outputs(
            status="demo",
            files_analyzed=1,
            conflicted_files=1,
            report_path=report_path or None,
        )
        return

    base = pr.get("base") or {}
    head = pr.get("head") or {}
    base_ref = base.get("ref") or ""
    head_ref = head.get("ref") or ""
    immutable_targets = _load_immutable_targets(pr, allow_event_fallback=merge_engine != "git")
    base_sha = immutable_targets.base_sha
    head_sha = immutable_targets.head_sha

    try:
        if merge_engine == "git":
            if not isolated_workspace:
                raise RuntimeError("git merge engine requires TONIC_AGENT_ISOLATED_WORKSPACE")
            source_workspace = os.environ.get("GITHUB_WORKSPACE", "").strip()
            if source_workspace and Path(source_workspace).resolve() == Path(isolated_workspace).resolve():
                raise RuntimeError("isolated workspace must differ from source workspace")
            pairs_git = hydrate_git_merge(
                workspace=isolated_workspace,
                base_sha=base_sha,
                head_sha=head_sha,
                max_files=max_files,
                git_merge_hydration=git_merge_hydration_from_env(),
            )
            pairs = {
                p: (d["left_lines"], d["right_lines"], str(d["status"]))
                for p, d in pairs_git.items()
            }
        else:
            pairs_git = {}
            pairs = hydrate_pr_files(
                owner,
                name,
                base_sha,
                head_sha,
                token,
                mode=hydrate_mode,
                max_files=max_files,
            )
    except Exception as e:  # noqa: BLE001
        print(f"Tonic agent: hydrate failed: {e}", file=sys.stderr)
        raise

    from .ast_hydration_step import run_ast_hydration_step

    ast_workspace = isolated_workspace if merge_engine == "git" else (os.environ.get("GITHUB_WORKSPACE", "").strip() or ".")
    ast_hydration_payload = run_ast_hydration_step(ast_workspace)

    _validate_completion_readiness(pairs)

    artifacts: list[MergeArtifact] = []
    for path, (left_lines, right_lines, _st) in sorted(pairs.items()):
        merged, annotated = merge_snapshots(
            left_lines,
            right_lines,
            left_commit_id=base_sha if enable_blame else "",
            right_commit_id=head_sha if enable_blame else "",
        )
        git_data = pairs_git.get(path, {})
        if isinstance(git_data.get("annotated_lines"), list):
            annotated = [str(x) for x in git_data["annotated_lines"]]
        if isinstance(git_data.get("merged_lines"), list):
            merged = [str(x) for x in git_data["merged_lines"]]
        cf = annotated_to_conflict_file(path, annotated)
        if enable_blame:
            left_ids = [base_sha][: max(0, blame_max_commits)]
            right_ids = [head_sha][: max(0, blame_max_commits)]
            for c in cf.conflicts:
                c.left_commit_ids = left_ids
                c.right_commit_ids = right_ids
        markers = any(ln.startswith("<<<<<<< begin") for ln in annotated)
        art = MergeArtifact(
            path=path,
            base_sha=base_sha,
            head_sha=head_sha,
            left_line_count=len(left_lines),
            right_line_count=len(right_lines),
            merged_line_count=len(merged),
            markers_present=markers,
            conflict_regions=[c.to_dict() for c in cf.conflicts],
            left_commit_id=base_sha if enable_blame else "",
            right_commit_id=head_sha if enable_blame else "",
            annotated_lines=annotated,
        )
        artifacts.append(art)

    include_annotated = verbosity == Verbosity.HIGH

    path_to_annotated: dict[str, str] = {}
    for a in artifacts:
        if a.markers_present and a.annotated_lines:
            path_to_annotated[a.path] = "\n".join(a.annotated_lines)

    marker_branch_result: dict | None = None
    if merge_engine == "git":
        pr_number_target, head_sha_target = _orchestrate_run_pr(
            workspace=isolated_workspace or os.getcwd(),
            owner=owner,
            repo=name,
            token=token,
            run_id=run_id,
            source_pr_number=immutable_targets.source_pr_number,
            target_base_branch=immutable_targets.base_branch,
            base_sha=base_sha,
            head_sha=head_sha,
            title=title,
        )
        publish_context = PublishContext(
            source_pr_number=immutable_targets.source_pr_number,
            target_pr_number=pr_number_target,
            target_head_sha=head_sha_target,
            target_base_branch=immutable_targets.base_branch,
            source_head_sha=head_sha,
        )
        _assert_target_context(publish_context)
    else:
        publish_context = PublishContext(
            source_pr_number=immutable_targets.source_pr_number,
            target_pr_number=immutable_targets.source_pr_number,
            target_head_sha=head_sha,
            target_base_branch=immutable_targets.base_branch,
            source_head_sha=head_sha,
        )
    if path_to_annotated and token:
        try:
            marker_branch_result = push_tonic_marker_branch(
                owner,
                name,
                publish_context.target_head_sha,
                publish_context.target_pr_number,
                run_id,
                token,
                path_to_annotated,
            )
        except Exception as e:  # noqa: BLE001
            print(f"Warning: Tonic marker branch push failed: {e}", file=sys.stderr)

    merge_report_artifact_name = Path(report_path).name if report_path else None

    report = merge_report_dict(
        run_id=run_id,
        pr_title=title,
        base_sha=base_sha,
        head_sha=head_sha,
        base_ref=base_ref,
        head_ref=head_ref,
        artifacts=artifacts,
        include_annotated=include_annotated,
        embed_annotated_for_marker_files=True,
        marker_branch=marker_branch_result["branch"] if marker_branch_result else None,
        marker_branch_commit=marker_branch_result["commit_sha"]
        if marker_branch_result
        else None,
        marker_paths=marker_branch_result["paths"] if marker_branch_result else None,
        merge_report_artifact_name=merge_report_artifact_name,
        ast_hydration=ast_hydration_payload,
    )

    if report_path:
        try:
            with open(report_path, "w", encoding="utf-8") as rf:
                json.dump(report, rf, indent=2)
        except OSError as e:
            print(f"Warning: could not write report file: {e}", file=sys.stderr)

    files_payload: list[dict] = []
    for a in artifacts:
        row: dict = {
            "path": a.path,
            "merged_line_count": a.merged_line_count,
            "conflict_regions": len(a.conflict_regions),
            "markers_present": a.markers_present,
            "left_line_count": a.left_line_count,
            "right_line_count": a.right_line_count,
        }
        if include_annotated:
            row["annotated_lines"] = a.annotated_lines
        files_payload.append(row)

    summary_body = build_summary_body(run_id, title, files_payload, verbosity=verbosity)

    if mode != CommentMode.INLINE_ONLY and token:
        try:
            upsert_issue_comment(
                owner,
                name,
                publish_context.target_pr_number,
                token,
                summary_upsert_prefix(),
                summary_body,
            )
        except RuntimeError as e:
            print(f"Warning: could not upsert summary comment: {e}", file=sys.stderr)

    existing_review_bodies: list[str] = []
    if mode in (CommentMode.FILE_INLINE, CommentMode.ALL, CommentMode.INLINE_ONLY) and token:
        try:
            existing_rc = list_pull_review_comments(
                owner, name, publish_context.target_pr_number, token
            )
            existing_review_bodies = [str(c.get("body") or "") for c in existing_rc]
        except RuntimeError:
            existing_review_bodies = []

    inline_per_path: dict[str, int] = {}
    inline_provider = _get_ai_provider(enable_ai)

    for a in artifacts:
        path = a.path
        left_lines, right_lines, _st = pairs[path]
        cf = apply_pr_labels_to_conflict_file(annotated_to_conflict_file(path, a.annotated_lines))

        if mode in (CommentMode.FILE_INLINE, CommentMode.ALL) and token and a.markers_present:
            ai_note = _ai_note_for_file(cf, enable_ai)
            body = build_file_top_comment(
                path,
                left_lines,
                right_lines,
                a.annotated_lines,
                ai_note=ai_note,
                marker_branch=marker_branch_result["branch"]
                if marker_branch_result
                else None,
                merge_report_artifact=merge_report_artifact_name,
            )
            try:
                upsert_issue_comment(
                    owner,
                    name,
                    publish_context.target_pr_number,
                    token,
                    file_upsert_prefix(path),
                    body,
                )
            except RuntimeError as e:
                print(f"Warning: file comment failed for {path}: {e}", file=sys.stderr)

        if (
            mode in (CommentMode.FILE_INLINE, CommentMode.ALL, CommentMode.INLINE_ONLY)
            and token
            and a.markers_present
        ):
            prefer_after_line_0 = 0
            for reg in cf.conflicts:
                if inline_per_path.get(path, 0) >= max_inline:
                    break
                snippet = _annotated_region_snippet(a.annotated_lines, reg)
                if not snippet.strip():
                    snippet = "\n".join(
                        [reg.left_content, reg.right_content]
                    ).strip()
                map_res = conflict_region_to_head_span_result(
                    reg, right_lines, prefer_after_line_0=prefer_after_line_0
                )
                is_orphan = map_res["kind"] != "unique"

                h_start, h_end = 1, 1
                old_lines: list[str] = []
                if not is_orphan:
                    h_start, h_end = map_res["span"]
                    prefer_after_line_0 = h_end
                    sl, sr = h_start - 1, h_end - 1
                    old_lines = (
                        right_lines[sl : sr + 1] if sr < len(right_lines) else []
                    )

                hydration_appendix = ""
                if ast_hydration_payload and not is_orphan:
                    hydration_appendix = build_merge_llm_hydration_appendix(
                        ast_workspace, ast_hydration_payload, path
                    )
                resolved, rat, used_ai = _resolved_lines_for_region(
                    cf,
                    reg,
                    inline_provider if not is_orphan else None,
                    hydration_appendix=hydration_appendix,
                )
                if not is_orphan and not suggestion_line_count_ok(
                    resolved, len(old_lines)
                ):
                    resolved = heuristic_resolved_lines(reg)
                    used_ai = False
                    rat = None

                use_fence = (
                    not is_orphan
                    and suggestion_line_count_ok(resolved, len(old_lines))
                    and len(resolved) <= max_suggestion_lines
                )
                diff_txt = (
                    build_unified_diff(old_lines, resolved, path=path)
                    if not is_orphan and (old_lines or resolved)
                    else ""
                )
                sugg_text = "\n".join(resolved) if use_fence else None
                summary = (
                    "**Proposed resolution** "
                    f"({'AI' if used_ai else 'heuristic — prefer head hunk'}):"
                )
                extra = (
                    None
                    if is_orphan
                    else build_github_suggestion_body(
                        summary=summary,
                        explanation=rat,
                        unified_diff=diff_txt or None,
                        suggestion_block=sugg_text,
                        include_suggestion_fence=bool(use_fence and sugg_text is not None),
                    )
                )

                reason = (
                    "ambiguous"
                    if map_res["kind"] == "ambiguous"
                    else "unmapped"
                )
                ibody = (
                    build_orphan_inline_thread_comment(
                        path,
                        reg.start_line,
                        reg.end_line,
                        reg.conflict_kind,
                        reason,
                        snippet or "(empty)",
                        marker_branch=marker_branch_result["branch"]
                        if marker_branch_result
                        else None,
                        merge_report_artifact=merge_report_artifact_name,
                    )
                    if is_orphan
                    else build_inline_thread_comment(
                        path,
                        reg.start_line,
                        reg.end_line,
                        reg.conflict_kind,
                        snippet or "(empty)",
                        extra_sections=extra,
                        marker_branch=marker_branch_result["branch"]
                        if marker_branch_result
                        else None,
                        merge_report_artifact=merge_report_artifact_name,
                    )
                )

                dup_key = (
                    marker_orphan(
                        path, reg.start_line, reg.end_line, reg.conflict_kind, reason
                    )
                    if is_orphan
                    else marker_inline(
                        path, reg.start_line, reg.end_line, reg.conflict_kind
                    )
                )
                dup = any(dup_key in ex for ex in existing_review_bodies)
                if dup:
                    continue

                anchor_end = 1 if is_orphan else h_end
                api_start_line = None if is_orphan or h_end <= h_start else h_start
                try:
                    post_pull_review_comment(
                        owner,
                        name,
                        publish_context.target_pr_number,
                        ibody,
                        publish_context.target_head_sha,
                        path,
                        anchor_end,
                        "RIGHT",
                        token,
                        start_line=api_start_line,
                        start_side="RIGHT",
                    )
                    inline_per_path[path] = inline_per_path.get(path, 0) + 1
                    existing_review_bodies.append(ibody)
                except RuntimeError as e:
                    print(
                        f"Warning: inline review comment failed for {path}@{anchor_end}: {e}",
                        file=sys.stderr,
                    )

    if enable_checks and token and immutable_targets.source_pr_number:
        try:
            from .github_checks import post_tonic_check

            post_tonic_check(owner, name, publish_context.target_head_sha, token, artifacts, pairs)
        except Exception as e:  # noqa: BLE001
            print(f"Warning: Tonic GitHub Check run failed: {e}", file=sys.stderr)

    hydrate_stats = {
        "files_hydrated": len(pairs),
        "empty_both_sides": sum(
            1 for left_l, right_l, _st in pairs.values() if not left_l and not right_l
        ),
    }
    out: dict = {
        "summary": "ok",
        "files_analyzed": len(artifacts),
        "report_path": report_path or None,
        "hydrate": hydrate_stats,
    }
    if marker_branch_result:
        out["marker_branch"] = marker_branch_result["branch"]
        out["marker_branch_commit"] = marker_branch_result["commit_sha"]
    print(json.dumps(out))
    _write_action_outputs(
        status="ok",
        files_analyzed=len(artifacts),
        conflicted_files=sum(1 for a in artifacts if a.markers_present),
        report_path=report_path or None,
    )



if __name__ == "__main__":
    main()
