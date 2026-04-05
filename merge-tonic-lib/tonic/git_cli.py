"""Git subprocess helpers for merge-tonic git subcommands (parity with TS gitSubcommands)."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from tonic import current_lines, merge_states
from tonic.merge_utils import annotated_to_conflict_file, merge_snapshots, minimal_merge_report


def _git_hydrate_intents_is_ast_mode(argv: list[str]) -> bool:
    if (os.environ.get("TONIC_AST_GREP") or "").strip():
        return True
    flags = {
        "--rule",
        "--config",
        "-c",
        "--inline-rule",
        "--ruleset",
        "--run-out",
        "--changed-only",
        "--include",
        "--exclude",
        "--languages",
        "--max-matches-per-file",
        "--max-matches-per-rule",
    }
    for a in argv:
        if a.startswith("--ast-grep-"):
            return True
        if a in flags:
            return True
    return False


def cmd_git_hydrate_intents(repo: str, argv: list[str]) -> int:
    if _git_hydrate_intents_is_ast_mode(argv):
        from tonic.ast_grep_hydrate import parse_ast_grep_hydrate_argv, run_ast_grep_hydrate

        opts = parse_ast_grep_hydrate_argv(["--repo", repo, *argv])
        return run_ast_grep_hydrate(opts)
    profile = Path(repo) / ".tonic" / "intent-profile.json"
    for i, a in enumerate(argv):
        if a in ("--intent-profile", "--intent_profile") and i + 1 < len(argv):
            profile = Path(argv[i + 1]).expanduser()
            break
    left = "Preserve left-side changes where appropriate."
    right = "Preserve right-side changes where appropriate."
    if profile.is_file():
        try:
            data = json.loads(profile.read_text(encoding="utf-8"))
            left = str(data.get("leftIntent") or data.get("left_intent") or left)
            right = str(data.get("rightIntent") or data.get("right_intent") or right)
        except (json.JSONDecodeError, OSError):
            pass
    print(
        json.dumps(
            {
                "ok": True,
                "profile_path": str(profile),
                "left_intent": left,
                "right_intent": right,
            },
            indent=2,
        )
    )
    return 0


def _git_run(repo: str, args: list[str], *, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", repo, *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=check,
    )


def _git_ok(repo: str, args: list[str], ctx: str) -> str:
    cp = _git_run(repo, args)
    if cp.returncode != 0:
        msg = (cp.stderr or cp.stdout or "").strip()
        raise RuntimeError(f"{ctx}: git {' '.join(args)}\n{msg}")
    return cp.stdout


def _norm_lines(s: str) -> list[str]:
    lines = s.splitlines()
    if lines and lines[-1] == "":
        lines = lines[:-1]
    return lines


def _match_path_filter(rel: str, filter_s: str) -> bool:
    r = rel.replace("\\", "/")
    f = filter_s.replace("\\", "/")
    if "*" not in f and "?" not in f:
        return r == f
    esc = re.escape(f).replace(r"\*", ".*").replace(r"\?", ".")
    return re.match(f"^{esc}$", r) is not None


def _filter_paths(names: list[str], filters: list[str]) -> list[str]:
    if not filters:
        return names
    return [n for n in names if any(_match_path_filter(n, flt) for flt in filters)]


def _write_annotated_file(
    abs_path: Path,
    annotated: list[str],
    *,
    backup: bool,
    atomic: bool,
) -> None:
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    body = "\n".join(annotated) + ("\n" if annotated else "")
    if backup and abs_path.is_file():
        shutil.copy2(abs_path, str(abs_path) + ".tonic.bak")
    if atomic and os.name != "nt":
        fd, tmp = tempfile.mkstemp(
            dir=str(abs_path.parent),
            prefix=".tonic-w.",
            suffix=".tmp",
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(body)
            os.replace(tmp, abs_path)
        except OSError:
            try:
                Path(tmp).unlink(missing_ok=True)
            except OSError:
                pass
            raise
    else:
        abs_path.write_text(body, encoding="utf-8")


def cmd_git_fetch(repo: str, remote: str, *, prune: bool = False, refs: list[str] | None = None) -> int:
    args = ["fetch", remote]
    if prune:
        args.append("--prune")
    if refs:
        args.extend(refs)
    cp = _git_run(repo, args)
    if cp.returncode != 0:
        print(cp.stderr.strip(), file=sys.stderr)
        return 1
    return 0


def _current_branch(repo: str) -> str:
    return _git_ok(repo, ["rev-parse", "--abbrev-ref", "HEAD"], "branch").strip()


def _resolve_ref_sha(repo: str, ref: str) -> str:
    return _git_ok(repo, ["rev-parse", ref], "rev-parse").strip()


def _git_show_text(repo: str, ref: str, rel: str) -> str | None:
    cp = _git_run(repo, ["show", f"{ref}:{rel}"])
    if cp.returncode != 0:
        return None
    return cp.stdout


def _manifest_at_ref(repo: str, ref: str) -> dict | None:
    raw = _git_show_text(repo, ref, ".tonic/weave/manifest.json")
    if raw is None:
        return None
    try:
        from tonic.weave_git.manifest import parse_manifest_json

        return parse_manifest_json(raw)  # type: ignore[return-value]
    except Exception:
        return None


def _read_weave_blob(repo: str, sha: str) -> str | None:
    p = Path(repo) / ".tonic" / "weave" / "blobs" / sha
    if not p.is_file():
        return None
    return p.read_text(encoding="utf-8")


def _three_way_paths(repo: str, base_ref: str, left_ref: str, right_ref: str) -> list[str]:
    names: set[str] = set()
    for a, b in ((base_ref, left_ref), (base_ref, right_ref), (left_ref, right_ref)):
        out = _git_ok(repo, ["diff", "--name-only", a, b], "diff")
        for line in out.splitlines():
            t = line.strip()
            if t:
                names.add(t)
    return sorted(names)


def _git_merge_file_stdout(left: str, base: str, right: str) -> str:
    with tempfile.TemporaryDirectory(prefix="mt-mf-") as d:
        pl, pb, pr = Path(d) / "l", Path(d) / "b", Path(d) / "r"
        pl.write_text(left, encoding="utf-8")
        pb.write_text(base, encoding="utf-8")
        pr.write_text(right, encoding="utf-8")
        cp = subprocess.run(
            ["git", "merge-file", "-p", str(pl), str(pb), str(pr)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        return (cp.stdout or "").replace("\r\n", "\n")


def cmd_git_compare(
    repo: str,
    *,
    remote: str = "origin",
    base_branch: str = "main",
    merge_branch: str | None = None,
    left_ref: str | None = None,
    right_ref: str | None = None,
    dry_run: bool = False,
    write: bool = False,
    into_branch: str | None = None,
    report_path: str | None = None,
    path_filters: list[str] | None = None,
    swap_stages: bool = False,
    backup: bool = False,
    atomic: bool = True,
    blame: bool = False,
    blame_max_commits: int = 3,
    weave_merge: bool = False,
    hub_prefetch: bool = False,
    hub_repo_id: str = "",
) -> int:
    if not left_ref or not right_ref:
        if not merge_branch:
            print("git compare: need --merge-branch or both --left-ref and --right-ref", file=sys.stderr)
            return 1
        left_ref = left_ref or f"{remote}/{base_branch}"
        right_ref = right_ref or f"{remote}/{merge_branch}"

    assert left_ref is not None and right_ref is not None
    if swap_stages:
        left_ref, right_ref = right_ref, left_ref

    need_fetch = bool(merge_branch) or (
        left_ref is not None
        and right_ref is not None
        and (
            left_ref.startswith(f"{remote}/")
            or right_ref.startswith(f"{remote}/")
        )
    )
    if need_fetch:
        try:
            _git_ok(repo, ["fetch", remote], "fetch")
        except RuntimeError as e:
            print(str(e), file=sys.stderr)
            return 1
    left_sha = _resolve_ref_sha(repo, left_ref)
    right_sha = _resolve_ref_sha(repo, right_ref)

    expected_write_branch = into_branch or (merge_branch or "")

    if expected_write_branch and write and not dry_run:
        cur = _current_branch(repo)
        if cur != expected_write_branch:
            print(
                f'Refusing --write: HEAD is "{cur}", expected "{expected_write_branch}"',
                file=sys.stderr,
            )
            return 1

    names_raw = _git_ok(repo, ["diff", "--name-only", left_ref, right_ref], "diff")
    names = _filter_paths(
        [n.strip() for n in names_raw.splitlines() if n.strip()],
        path_filters or [],
    )

    prefetch_keys: list[str] = []
    if weave_merge or hub_prefetch:
        ml = _manifest_at_ref(repo, left_ref)
        mr = _manifest_at_ref(repo, right_ref)
        for rel in names:
            k = rel.replace("\\", "/")
            for m in (ml, mr):
                if not m:
                    continue
                paths = m.get("paths") or {}
                ent = paths.get(k) if isinstance(paths, dict) else None
                if isinstance(ent, dict):
                    sha = ent.get("weave_serialized_sha")
                    if isinstance(sha, str) and sha:
                        prefetch_keys.append(sha)
    if (hub_prefetch or weave_merge) and prefetch_keys:
        try:
            from tonic.hf_weave.client import hub_prefetch_keys

            hub_prefetch_keys(
                keys=sorted(set(prefetch_keys)),
                repo_id=hub_repo_id.strip() or None,
                dest_dir=Path(repo) / ".tonic" / "weave" / "blobs",
            )
        except Exception:
            pass

    artifacts: list[dict] = []
    weave_degraded = False
    for rel in names:
        if ".." in rel or Path(rel).is_absolute():
            continue
        ls = _git_run(repo, ["show", f"{left_ref}:{rel}"])
        rs = _git_run(repo, ["show", f"{right_ref}:{rel}"])
        if ls.returncode != 0 or rs.returncode != 0:
            continue
        left = _norm_lines(ls.stdout)
        right = _norm_lines(rs.stdout)
        cf_path = rel.replace("\\", "/")
        merged: list[str]
        annotated: list[str]
        used_weave = False
        if weave_merge:
            ml = _manifest_at_ref(repo, left_ref)
            mr = _manifest_at_ref(repo, right_ref)
            ent_l = (ml.get("paths") or {}).get(cf_path) if ml else None
            ent_r = (mr.get("paths") or {}).get(cf_path) if mr else None
            sl = ent_l.get("weave_serialized_sha") if isinstance(ent_l, dict) else None
            sr = ent_r.get("weave_serialized_sha") if isinstance(ent_r, dict) else None
            if isinstance(sl, str) and isinstance(sr, str) and sl and sr:
                blob_l = _read_weave_blob(repo, sl)
                blob_r = _read_weave_blob(repo, sr)
                if blob_l is not None and blob_r is not None:
                    merged_state, ann = merge_states(blob_l, blob_r)
                    merged = current_lines(merged_state)
                    annotated = ann
                    used_weave = True
                else:
                    weave_degraded = True
            else:
                weave_degraded = True
        if not used_weave:
            merged, annotated = merge_snapshots(
                left,
                right,
                left_commit_id=left_sha if blame else "",
                right_commit_id=right_sha if blame else "",
            )
        markers_present = any(ln.startswith("<<<<<<< begin") for ln in annotated)
        cf = annotated_to_conflict_file(cf_path, annotated)
        art = {
            "version": "1",
            "path": cf_path,
            "base_sha": left_ref,
            "head_sha": right_ref,
            "left_line_count": len(left),
            "right_line_count": len(right),
            "merged_line_count": len(merged),
            "markers_present": markers_present,
            "conflict_region_count": len(cf.conflicts),
            "conflict_regions": [c.to_dict() for c in cf.conflicts],
        }
        if used_weave:
            art["weave_merge"] = True
        if blame:
            left_ids = [left_sha][: max(0, blame_max_commits)]
            right_ids = [right_sha][: max(0, blame_max_commits)]
            for region in art["conflict_regions"]:
                region["left_commit_ids"] = left_ids
                region["right_commit_ids"] = right_ids
        if markers_present:
            art["annotated_lines"] = annotated
        artifacts.append(art)
        if write and not dry_run:
            abs_path = Path(repo) / rel
            _write_annotated_file(abs_path, annotated, backup=backup, atomic=atomic)

    if report_path:
        report = minimal_merge_report(
            run_id="git-compare",
            pr_title="git compare",
            base_sha=left_ref,
            head_sha=right_ref,
            base_ref=left_ref,
            head_ref=right_ref,
            artifacts=artifacts,
            compare_mode="weave" if weave_merge else "two-way",
        )
        Path(report_path).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    if weave_degraded:
        print(
            "TONIC_WEAVE_COMPARE_DEGRADED: missing weave blobs or manifest rows; fell back to text merge",
            file=sys.stderr,
        )
    print(
        json.dumps(
            {
                "summary": "dry-run" if dry_run else "written" if write else "ok",
                "left_ref": left_ref,
                "right_ref": right_ref,
                "expected_write_branch": expected_write_branch or None,
                "files": len(artifacts),
                "paths": [a["path"] for a in artifacts],
                **({"weave_degraded": True} if weave_degraded else {}),
            }
        )
    )
    return 0


def cmd_git_compare_three(
    repo: str,
    *,
    remote: str = "origin",
    base_branch: str = "main",
    merge_branch: str | None = None,
    left_ref: str | None = None,
    right_ref: str | None = None,
    base_ref: str | None = None,
    dry_run: bool = False,
    write: bool = False,
    into_branch: str | None = None,
    report_path: str | None = None,
    path_filters: list[str] | None = None,
    swap_stages: bool = False,
    backup: bool = False,
    atomic: bool = True,
    blame: bool = False,
    blame_max_commits: int = 3,
    hub_prefetch: bool = False,
    hub_repo_id: str = "",
    write_weave: bool = False,
    weave_writeback_mode: str = "text",
    weave_driver_strict: bool = True,
    hydrate_after: list[str] | None = None,
) -> int:
    if not left_ref or not right_ref:
        if not merge_branch:
            print("git compare-three: need --merge-branch or both --left-ref and --right-ref", file=sys.stderr)
            return 1
        left_ref = left_ref or f"{remote}/{base_branch}"
        right_ref = right_ref or f"{remote}/{merge_branch}"
    assert left_ref is not None and right_ref is not None
    if swap_stages:
        left_ref, right_ref = right_ref, left_ref

    need_fetch = bool(merge_branch) or left_ref.startswith(f"{remote}/") or right_ref.startswith(f"{remote}/")
    if need_fetch:
        try:
            _git_ok(repo, ["fetch", remote], "fetch")
        except RuntimeError as e:
            print(str(e), file=sys.stderr)
            return 1

    base_r = (base_ref or "").strip()
    if not base_r:
        base_r = _git_ok(repo, ["merge-base", left_ref, right_ref], "merge-base").strip()

    left_sha = _resolve_ref_sha(repo, left_ref)
    right_sha = _resolve_ref_sha(repo, right_ref)
    base_sha = _resolve_ref_sha(repo, base_r)

    expected_write_branch = into_branch or (merge_branch or "")
    wbm = (weave_writeback_mode or "text").strip().lower()
    if wbm not in ("text", "weave"):
        print("git compare-three: --weave-writeback-mode must be text or weave", file=sys.stderr)
        return 1
    if expected_write_branch and (write or write_weave) and not dry_run:
        cur = _current_branch(repo)
        if cur != expected_write_branch:
            print(
                f'Refusing --write/--write-weave: HEAD is "{cur}", expected "{expected_write_branch}"',
                file=sys.stderr,
            )
            return 1

    names = _filter_paths(_three_way_paths(repo, base_r, left_ref, right_ref), path_filters or [])

    mb = _manifest_at_ref(repo, base_r)
    ml = _manifest_at_ref(repo, left_ref)
    mr = _manifest_at_ref(repo, right_ref)
    prefetch_keys: list[str] = []
    if hub_prefetch or (write_weave and wbm == "weave"):
        for rel in names:
            k = rel.replace("\\", "/")
            for m in (mb, ml, mr):
                if not m:
                    continue
                paths = m.get("paths") or {}
                ent = paths.get(k) if isinstance(paths, dict) else None
                if isinstance(ent, dict):
                    sha = ent.get("weave_serialized_sha")
                    if isinstance(sha, str) and sha:
                        prefetch_keys.append(sha)
    if prefetch_keys:
        try:
            from tonic.hf_weave.client import hub_prefetch_keys as hf_prefetch

            hf_prefetch(
                keys=sorted(set(prefetch_keys)),
                repo_id=hub_repo_id.strip() or None,
                dest_dir=Path(repo) / ".tonic" / "weave" / "blobs",
            )
        except Exception:
            pass

    from tonic.git_merge_tonic import git_merge_file_output_to_tonic_annotated
    from tonic.weave_git.writeback import (
        build_entry_text_mode,
        entry_engine_version,
        load_or_init_manifest,
        merge_three_weave_driver,
        persist_writeback,
    )

    manifest_path = Path(repo) / ".tonic" / "weave" / "manifest.json"
    disk_manifest = load_or_init_manifest(manifest_path, repo) if write_weave else None
    path_updates: dict = {}
    serialized_by_path: dict[str, str] = {}

    artifacts: list[dict] = []
    for rel in names:
        if ".." in rel or Path(rel).is_absolute():
            continue
        cf_path = rel.replace("\\", "/")
        base_text = _git_show_text(repo, base_r, rel) or ""
        left_text = _git_show_text(repo, left_ref, rel) or ""
        right_text = _git_show_text(repo, right_ref, rel) or ""
        merged_git = _git_merge_file_stdout(
            left_text if left_text.endswith("\n") or not left_text else left_text + "\n",
            base_text if base_text.endswith("\n") or not base_text else base_text + "\n",
            right_text if right_text.endswith("\n") or not right_text else right_text + "\n",
        )
        annotated_git = git_merge_file_output_to_tonic_annotated(merged_git)
        use_weave_driver = bool(write_weave and wbm == "weave")
        annotated = annotated_git
        driver_stderr: list[str] = []
        d_entry = None
        d_ser = None
        if use_weave_driver:
            ent_b = (mb.get("paths") or {}).get(cf_path) if mb else None
            ent_l = (ml.get("paths") or {}).get(cf_path) if ml else None
            ent_r = (mr.get("paths") or {}).get(cf_path) if mr else None
            if not isinstance(ent_b, dict):
                ent_b = None
            if not isinstance(ent_l, dict):
                ent_l = None
            if not isinstance(ent_r, dict):
                ent_r = None
            assert disk_manifest is not None
            wfv, did = disk_manifest.get("weave_format_version"), disk_manifest.get("diff_engine_id")
            wfv_s = wfv.strip() if isinstance(wfv, str) and wfv.strip() else "1"
            did_s = did.strip() if isinstance(did, str) and did.strip() else "tonic-v1"
            wfv_s, did_s = entry_engine_version(ent_l, wfv_s, did_s)
            wfv_s, did_s = entry_engine_version(ent_r, wfv_s, did_s)
            wfv_s, did_s = entry_engine_version(ent_b, wfv_s, did_s)
            d_lines, d_entry, d_ser, driver_stderr = merge_three_weave_driver(
                repo=repo,
                rel_path=cf_path,
                text_base=base_text,
                text_left=left_text,
                text_right=right_text,
                ent_base=ent_b,
                ent_left=ent_l,
                ent_right=ent_r,
                weave_format_version=wfv_s,
                diff_engine_id=did_s,
                strict=weave_driver_strict,
            )
            if d_entry is None or d_ser is None:
                for line in driver_stderr:
                    print(line, file=sys.stderr)
                print(
                    "git compare-three: weave write-back mode failed (missing blobs or compatibility); "
                    "use --weave-writeback-mode text for Mode A (degraded) or ensure .tonic/weave/blobs",
                    file=sys.stderr,
                )
                return 1
            annotated = d_lines
        markers_present = any(ln.startswith("<<<<<<< begin") for ln in annotated)
        merged = _norm_lines(merged_git) if not use_weave_driver else _norm_lines("\n".join(annotated))
        left = _norm_lines(left_text)
        right = _norm_lines(right_text)
        cf = annotated_to_conflict_file(cf_path, annotated)
        art = {
            "version": "1",
            "path": cf_path,
            "base_sha": left_ref,
            "head_sha": right_ref,
            "merge_base_sha": base_sha,
            "compare_three": True,
            "left_line_count": len(left),
            "right_line_count": len(right),
            "merged_line_count": len(merged),
            "markers_present": markers_present,
            "conflict_region_count": len(cf.conflicts),
            "conflict_regions": [c.to_dict() for c in cf.conflicts],
        }
        if use_weave_driver:
            art["weave_writeback"] = "weave"
        if blame:
            left_ids = [left_sha][: max(0, blame_max_commits)]
            right_ids = [right_sha][: max(0, blame_max_commits)]
            for region in art["conflict_regions"]:
                region["left_commit_ids"] = left_ids
                region["right_commit_ids"] = right_ids
        if markers_present:
            art["annotated_lines"] = annotated
        artifacts.append(art)
        disk_write = write and not dry_run
        if disk_write:
            abs_path = Path(repo) / rel
            _write_annotated_file(abs_path, annotated, backup=backup, atomic=atomic)
        if write_weave and disk_manifest is not None:
            assert disk_manifest is not None
            wfv_r, did_r = disk_manifest.get("weave_format_version"), disk_manifest.get("diff_engine_id")
            wfv0 = wfv_r.strip() if isinstance(wfv_r, str) and wfv_r.strip() else "1"
            did0 = did_r.strip() if isinstance(did_r, str) and did_r.strip() else "tonic-v1"
            ent_l2 = (ml.get("paths") or {}).get(cf_path) if ml else None
            ent_r2 = (mr.get("paths") or {}).get(cf_path) if mr else None
            parents: list[str] = []
            if isinstance(ent_l2, dict) and isinstance(ent_l2.get("weave_serialized_sha"), str):
                parents.append(ent_l2["weave_serialized_sha"])
            if isinstance(ent_r2, dict) and isinstance(ent_r2.get("weave_serialized_sha"), str):
                parents.append(ent_r2["weave_serialized_sha"])
            if use_weave_driver and d_entry is not None and d_ser is not None:
                path_updates[cf_path] = d_entry
                serialized_by_path[cf_path] = d_ser
            else:
                entry, ser = build_entry_text_mode(
                    rel_path=cf_path,
                    annotated_lines=annotated,
                    weave_format_version=wfv0,
                    diff_engine_id=did0,
                    parent_weave_shas=parents or None,
                )
                path_updates[cf_path] = entry
                serialized_by_path[cf_path] = ser

    if write_weave and disk_manifest is not None and not dry_run:
        persist_writeback(
            repo,
            disk_manifest,
            path_updates,
            serialized_by_path,
            dry_run=False,
        )

    if report_path:
        report = minimal_merge_report(
            run_id="git-compare-three",
            pr_title="git compare-three",
            base_sha=base_sha,
            head_sha=right_sha,
            base_ref=base_r,
            head_ref=right_ref,
            artifacts=artifacts,
            merge_base_sha=base_sha,
            left_ref=left_ref,
            right_ref=right_ref,
            compare_mode="three-way",
        )
        Path(report_path).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    out_payload = {
        "summary": "dry-run" if dry_run else "written" if write or write_weave else "ok",
        "merge_base_ref": base_r,
        "merge_base_sha": base_sha,
        "left_ref": left_ref,
        "right_ref": right_ref,
        "expected_write_branch": expected_write_branch or None,
        "files": len(artifacts),
        "paths": [a["path"] for a in artifacts],
    }
    if write_weave:
        out_payload["write_weave"] = True
        out_payload["weave_writeback_mode"] = wbm
    print(json.dumps(out_payload))

    if hydrate_after and not dry_run:
        from tonic.hydration_pipeline import cmd_hydrate

        return cmd_hydrate(["--repo", repo, *hydrate_after])
    return 0


def cmd_git_materialize(
    repo: str,
    *,
    dry_run: bool = False,
    write: bool = False,
    strategy: str = "ours-theirs",
    path_filters: list[str] | None = None,
    swap_stages: bool = False,
    backup: bool = False,
    atomic: bool = True,
    blame: bool = False,
) -> int:
    if strategy != "ours-theirs":
        print('Only --strategy ours-theirs is supported (stage :2 / :3)', file=sys.stderr)
        return 1
    try:
        names_raw = _git_ok(repo, ["diff", "--name-only", "--diff-filter", "U"], "unmerged")
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    names = _filter_paths(
        [n.strip() for n in names_raw.splitlines() if n.strip()],
        path_filters or [],
    )
    for rel in names:
        stage_ours = f":3:{rel}" if swap_stages else f":2:{rel}"
        stage_theirs = f":2:{rel}" if swap_stages else f":3:{rel}"
        ls = _git_run(repo, ["show", stage_ours])
        rs = _git_run(repo, ["show", stage_theirs])
        if ls.returncode != 0 or rs.returncode != 0:
            continue
        left = _norm_lines(ls.stdout)
        right = _norm_lines(rs.stdout)
        left_stage_id = f"stage:{'3' if swap_stages else '2'}:{rel}" if blame else ""
        right_stage_id = f"stage:{'2' if swap_stages else '3'}:{rel}" if blame else ""
        _, annotated = merge_snapshots(left, right, left_commit_id=left_stage_id, right_commit_id=right_stage_id)
        if write and not dry_run:
            abs_path = Path(repo) / rel
            _write_annotated_file(abs_path, annotated, backup=backup, atomic=atomic)
    print(
        json.dumps(
            {
                "summary": "dry-run" if dry_run else "written" if write else "ok",
                "unmerged": len(names),
            }
        )
    )
    return 0


def cmd_git_merge(repo: str, ref: str, *, no_commit: bool = False) -> int:
    args = ["merge", "--no-ff"]
    if no_commit:
        args.append("--no-commit")
    args.append(ref)
    cp = _git_run(repo, args)
    if cp.returncode == 0:
        print(json.dumps({"status": "merged", "message": (cp.stdout + cp.stderr).strip()}))
        return 0
    unmerged = _git_run(repo, ["diff", "--name-only", "--diff-filter", "U"])
    paths = [p.strip() for p in unmerged.stdout.splitlines() if p.strip()]
    if paths:
        print(
            json.dumps(
                {
                    "status": "conflicts",
                    "paths": paths,
                    "stderr": (cp.stderr or "").strip(),
                }
            )
        )
        return 0
    print((cp.stderr or cp.stdout or "git merge failed").strip(), file=sys.stderr)
    return cp.returncode or 1


def cmd_git_worktree(repo: str, sub: str, **kw: str | bool) -> int:
    if sub == "add":
        p = kw.get("path") or ""
        ref = kw.get("ref") or ""
        if not p or not ref:
            print("git worktree add: need --path and --ref", file=sys.stderr)
            return 1
        cp = _git_run(repo, ["worktree", "add", "--detach", str(p), str(ref)])
        if cp.returncode != 0:
            print(cp.stderr.strip(), file=sys.stderr)
            return 1
        return 0
    if sub == "list":
        print(_git_ok(repo, ["worktree", "list", "--porcelain"], "worktree list"), end="")
        return 0
    if sub == "remove":
        p = kw.get("path") or ""
        if not p:
            print("git worktree remove: need --path", file=sys.stderr)
            return 1
        cp = _git_run(repo, ["worktree", "remove", "--force", str(p)])
        if cp.returncode != 0:
            print(cp.stderr.strip(), file=sys.stderr)
            return 1
        return 0
    print("Usage: merge-tonic git worktree add|list|remove ...", file=sys.stderr)
    return 1
