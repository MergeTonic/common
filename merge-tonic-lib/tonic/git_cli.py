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

from tonic.merge_utils import annotated_to_conflict_file, merge_snapshots, minimal_merge_report


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


def cmd_git_fetch(repo: str, remote: str, *, prune: bool = False) -> int:
    args = ["fetch", remote]
    if prune:
        args.append("--prune")
    cp = _git_run(repo, args)
    if cp.returncode != 0:
        print(cp.stderr.strip(), file=sys.stderr)
        return 1
    return 0


def _current_branch(repo: str) -> str:
    return _git_ok(repo, ["rev-parse", "--abbrev-ref", "HEAD"], "branch").strip()


def _resolve_ref_sha(repo: str, ref: str) -> str:
    return _git_ok(repo, ["rev-parse", ref], "rev-parse").strip()


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
    artifacts: list[dict] = []

    for rel in names:
        if ".." in rel or Path(rel).is_absolute():
            continue
        ls = _git_run(repo, ["show", f"{left_ref}:{rel}"])
        rs = _git_run(repo, ["show", f"{right_ref}:{rel}"])
        if ls.returncode != 0 or rs.returncode != 0:
            continue
        left = _norm_lines(ls.stdout)
        right = _norm_lines(rs.stdout)
        merged, annotated = merge_snapshots(
            left,
            right,
            left_commit_id=left_sha if blame else "",
            right_commit_id=right_sha if blame else "",
        )
        cf_path = rel.replace("\\", "/")
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
        )
        Path(report_path).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "summary": "dry-run" if dry_run else "written" if write else "ok",
                "left_ref": left_ref,
                "right_ref": right_ref,
                "expected_write_branch": expected_write_branch or None,
                "files": len(artifacts),
                "paths": [a["path"] for a in artifacts],
            }
        )
    )
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
