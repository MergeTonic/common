"""GitHub Action entry: PR summary + optional file/inline comments."""

from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path

from .github_api import (
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
from .marker_branch import push_tonic_marker_branch
from .merge import annotated_to_conflict_file, merge_snapshots
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


def _resolved_lines_for_region(cf, reg, provider):
    if provider:
        try:
            resp = provider.resolve_conflict(cf, reg)
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
            resp = provider.resolve_conflict(cf, reg)
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
    enable_ai = _truthy(os.environ.get("INPUT_ENABLE_AI"))
    enable_checks = _truthy(os.environ.get("INPUT_ENABLE_CHECKS"))
    enable_blame = _truthy(os.environ.get("INPUT_ENABLE_BLAME"))
    try:
        blame_max_commits = int(os.environ.get("INPUT_BLAME_MAX_COMMITS", "3") or "3")
    except ValueError:
        blame_max_commits = 3
    max_files = int(os.environ.get("TONIC_AGENT_MAX_FILES", "200") or "200")
    report_path = os.environ.get("TONIC_AGENT_REPORT_PATH", "").strip()

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
    pr = event.get("pull_request") or {}
    title = pr.get("title") or "PR"
    number = pr.get("number")
    repo = os.environ.get("GITHUB_REPOSITORY", "")

    if not number or not repo or not token:
        _run_demo_local(verbosity, run_id)
        _write_action_outputs(
            status="demo",
            files_analyzed=1,
            conflicted_files=1,
            report_path=report_path or None,
        )
        return

    owner, name = repo.split("/", 1)
    base = pr.get("base") or {}
    head = pr.get("head") or {}
    base_sha = base.get("sha") or ""
    head_sha = head.get("sha") or ""
    base_ref = base.get("ref") or ""
    head_ref = head.get("ref") or ""

    if not base_sha or not head_sha:
        print("Tonic agent: missing base.sha or head.sha on pull_request event", file=sys.stderr)
        _run_demo_local(verbosity, run_id)
        _write_action_outputs(
            status="demo",
            files_analyzed=1,
            conflicted_files=1,
            report_path=report_path or None,
        )
        return

    try:
        pairs = hydrate_pr_files(
            owner,
            name,
            base_sha,
            head_sha,
            token,
            mode=hydrate_mode,
            max_files=max_files,
        )
    except RuntimeError as e:
        print(f"Tonic agent: hydrate failed: {e}", file=sys.stderr)
        _run_demo_local(verbosity, run_id)
        _write_action_outputs(
            status="demo",
            files_analyzed=1,
            conflicted_files=1,
            report_path=report_path or None,
        )
        return

    artifacts: list[MergeArtifact] = []
    for path, (left_lines, right_lines, _st) in sorted(pairs.items()):
        merged, annotated = merge_snapshots(
            left_lines,
            right_lines,
            left_commit_id=base_sha if enable_blame else "",
            right_commit_id=head_sha if enable_blame else "",
        )
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
    if path_to_annotated and token:
        try:
            marker_branch_result = push_tonic_marker_branch(
                owner,
                name,
                head_sha,
                int(number),
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
                int(number),
                token,
                summary_upsert_prefix(),
                summary_body,
            )
        except RuntimeError as e:
            print(f"Warning: could not upsert summary comment: {e}", file=sys.stderr)

    existing_review_bodies: list[str] = []
    if mode in (CommentMode.FILE_INLINE, CommentMode.ALL, CommentMode.INLINE_ONLY) and token:
        try:
            existing_rc = list_pull_review_comments(owner, name, int(number), token)
            existing_review_bodies = [str(c.get("body") or "") for c in existing_rc]
        except RuntimeError:
            existing_review_bodies = []

    inline_per_path: dict[str, int] = {}
    inline_provider = _get_ai_provider(enable_ai)

    for a in artifacts:
        path = a.path
        left_lines, right_lines, _st = pairs[path]
        cf = annotated_to_conflict_file(path, a.annotated_lines)

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
                    int(number),
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

                resolved, rat, used_ai = _resolved_lines_for_region(
                    cf, reg, inline_provider if not is_orphan else None
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
                        int(number),
                        ibody,
                        head_sha,
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

    if enable_checks and token and number:
        try:
            from .github_checks import post_tonic_check

            post_tonic_check(owner, name, head_sha, token, artifacts, pairs)
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
