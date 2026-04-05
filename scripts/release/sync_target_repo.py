#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path


def _run(cmd: list[str], cwd: Path | None = None, capture: bool = False) -> str:
    if capture:
        return subprocess.check_output(cmd, cwd=str(cwd) if cwd else None, text=True).strip()
    subprocess.check_call(cmd, cwd=str(cwd) if cwd else None)
    return ""


def _has_any_commit(checkout_dir: Path) -> bool:
    """False for a freshly cloned empty GitHub repo (no commits yet)."""
    r = subprocess.run(
        ["git", "rev-parse", "--verify", "HEAD"],
        cwd=str(checkout_dir),
        capture_output=True,
        text=True,
    )
    return r.returncode == 0


def _ensure_git_identity(checkout_dir: Path) -> None:
    """CI runners often have no global user.*; set local identity for commits in this clone."""
    name = os.environ.get("GIT_COMMITTER_NAME") or os.environ.get("TONIC_SYNC_GIT_USER_NAME")
    email = os.environ.get("GIT_COMMITTER_EMAIL") or os.environ.get("TONIC_SYNC_GIT_USER_EMAIL")
    actor = os.environ.get("GITHUB_ACTOR", "")
    if not name:
        name = actor or "mergetonic-sync"
    if not email:
        if actor == "github-actions[bot]":
            email = "41898282+github-actions[bot]@users.noreply.github.com"
        elif actor:
            email = f"{actor}@users.noreply.github.com"
        else:
            email = "mergetonic-sync@users.noreply.github.com"
    _run(["git", "config", "user.name", name], cwd=checkout_dir)
    _run(["git", "config", "user.email", email], cwd=checkout_dir)


def _split_csv(items: str) -> list[str]:
    if not items.strip():
        return []
    return [x.strip() for x in items.split(",") if x.strip()]


def _safe_remove(path: Path) -> None:
    if not path.exists():
        return
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()


def _copy_item(src: Path, dst: Path) -> None:
    if src.is_dir():
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def _copy_managed(source: Path, checkout_dir: Path, managed_paths: list[str]) -> None:
    for rel in managed_paths:
        src = source / rel
        dst = checkout_dir / rel
        if not src.exists():
            _safe_remove(dst)
            continue
        _copy_item(src, dst)


def _normalize(path: str) -> str:
    return path.replace("\\", "/").strip("/")


def _is_preserved(path: str, preserve_paths: list[str]) -> bool:
    norm = _normalize(path)
    for prefix in preserve_paths:
        p = _normalize(prefix)
        if norm == p or norm.startswith(p + "/"):
            return True
    return False


def _get_short_sha() -> str:
    return os.getenv("GITHUB_SHA", "local")[:8]


def _write_result(result_json: str, payload: dict) -> None:
    print(json.dumps(payload))
    if not result_json:
        return
    Path(result_json).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True, help="owner/name")
    parser.add_argument("--target-id", default="")
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--target-branch", default="main")
    parser.add_argument("--commit-message", required=True)
    parser.add_argument("--template-dir", default="")
    parser.add_argument("--managed-paths", default="", help="Comma-separated paths synced from source dir")
    parser.add_argument("--preserve-paths", default="", help="Comma-separated target-owned preserved paths")
    parser.add_argument("--pr-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--result-json", default="")
    args = parser.parse_args()

    source = Path(args.source_dir).resolve()
    work = Path(".tmp/release-sync")
    checkout_dir = work / args.repo.replace("/", "__")
    checkout_dir.parent.mkdir(parents=True, exist_ok=True)

    if checkout_dir.exists():
        shutil.rmtree(checkout_dir)

    _run(["git", "clone", f"https://github.com/{args.repo}.git", str(checkout_dir)])
    _run(["git", "fetch", "origin"], cwd=checkout_dir)
    if _has_any_commit(checkout_dir):
        _run(["git", "checkout", args.target_branch], cwd=checkout_dir)
    else:
        # Empty target: no remote branches yet — create local base branch for first commit.
        _run(["git", "checkout", "-b", args.target_branch], cwd=checkout_dir)

    empty_before_sync = not _has_any_commit(checkout_dir)
    _ensure_git_identity(checkout_dir)

    managed_paths = _split_csv(args.managed_paths)
    preserve_paths = _split_csv(args.preserve_paths)
    # Org profile repo layout: target has files under ./.github/, while source_dir is monorepo's
    # ".github" directory. Paths in managed_paths are relative to repo root, so use repo root as
    # source and managed_paths [".github"] (not .github/.github, which does not exist).
    if source.name == ".github" and (not managed_paths or managed_paths == [".github"]):
        source = source.parent
        managed_paths = [".github"]
    elif not managed_paths:
        managed_paths = [item.name for item in source.iterdir()]
    if ".git" not in preserve_paths:
        preserve_paths.append(".git")

    # Only clear paths that are explicitly managed and not preserved.
    for rel in managed_paths:
        if _is_preserved(rel, preserve_paths):
            continue
        _safe_remove(checkout_dir / rel)
    _copy_managed(source, checkout_dir, managed_paths)

    if args.template_dir:
        template_dir = Path(args.template_dir).resolve()
        if template_dir.exists():
            for item in template_dir.iterdir():
                dst = checkout_dir / item.name
                if item.is_dir():
                    # Merge into existing trees (e.g. keep monorepo .github/workflows, add template files).
                    shutil.copytree(item, dst, dirs_exist_ok=True)
                else:
                    shutil.copy2(item, dst)

    _run(["git", "add", "."], cwd=checkout_dir)

    diff_exit = subprocess.call(["git", "diff", "--cached", "--quiet"], cwd=checkout_dir)
    if diff_exit == 0:
        _write_result(
            args.result_json,
            {
                "target": args.target_id or args.repo,
                "mode": "pr-only" if args.pr_only else "direct-push",
                "changed": False,
                "status": "no_changes",
                "pr_url": "",
                "commit": "",
                "skipped_reason": "no_changes",
                "warnings": [],
            },
        )
        return 0

    _run(["git", "commit", "-m", args.commit_message], cwd=checkout_dir)
    commit_sha = _run(["git", "rev-parse", "HEAD"], cwd=checkout_dir, capture=True)
    # Open PRs need the base branch on the remote; empty repos have no remote branches yet.
    pr_only_effective = bool(args.pr_only) and not empty_before_sync
    pr_fallback_warning = ""
    if args.pr_only and empty_before_sync:
        pr_fallback_warning = (
            "empty target repository: pr-only requires a base branch on the remote; "
            "using direct-push for this run to create it"
        )

    if args.dry_run:
        warnings: list[str] = []
        if pr_fallback_warning:
            warnings.append(pr_fallback_warning)
        _write_result(
            args.result_json,
            {
                "target": args.target_id or args.repo,
                "mode": "pr-only" if args.pr_only else "direct-push",
                "changed": True,
                "status": "dry_run",
                "pr_url": "",
                "commit": commit_sha,
                "skipped_reason": "",
                "warnings": warnings,
            },
        )
        return 0

    if pr_only_effective:
        target_slug = args.target_id or source.name
        short_sha = _get_short_sha()
        branch_prefix = f"sync/{target_slug}/"
        branch_name = f"{branch_prefix}{short_sha}"
        existing_branch = _run(
            ["git", "ls-remote", "--heads", "origin", f"{branch_prefix}*"],
            cwd=checkout_dir,
            capture=True,
        )
        if existing_branch:
            first_line = existing_branch.splitlines()[0]
            remote_ref = first_line.split("\t", maxsplit=1)[1]
            branch_name = remote_ref.removeprefix("refs/heads/")
            _run(["git", "checkout", "-B", branch_name], cwd=checkout_dir)
        else:
            _run(["git", "checkout", "-b", branch_name], cwd=checkout_dir)
        _run(["git", "push", "-u", "origin", branch_name, "--force-with-lease"], cwd=checkout_dir)

        # Reuse an open PR when one exists.
        pr_lookup = _run(
            [
                "gh",
                "pr",
                "list",
                "--repo",
                args.repo,
                "--base",
                args.target_branch,
                "--head",
                branch_name,
                "--state",
                "open",
                "--json",
                "url",
                "--jq",
                ".[0].url",
            ],
            cwd=checkout_dir,
            capture=True,
        )
        status = "pr_updated"
        pr_url = pr_lookup
        if not pr_lookup:
            pr_url = _run(
                [
                    "gh",
                    "pr",
                    "create",
                    "--repo",
                    args.repo,
                    "--base",
                    args.target_branch,
                    "--head",
                    branch_name,
                    "--title",
                    args.commit_message,
                    "--body",
                    "Automated monorepo sync from common.",
                ],
                cwd=checkout_dir,
                capture=True,
            )
            status = "pr_created"
        warnings: list[str] = []
        if pr_fallback_warning:
            warnings.append(pr_fallback_warning)
        _write_result(
            args.result_json,
            {
                "target": args.target_id or args.repo,
                "mode": "pr-only",
                "changed": True,
                "status": status,
                "pr_url": pr_url,
                "commit": commit_sha,
                "branch": branch_name,
                "skipped_reason": "",
                "warnings": warnings,
            },
        )
        return 0

    _run(["git", "push", "-u", "origin", args.target_branch], cwd=checkout_dir)
    direct_warnings: list[str] = []
    if pr_fallback_warning:
        direct_warnings.append(pr_fallback_warning)
    _write_result(
        args.result_json,
        {
            "target": args.target_id or args.repo,
            "mode": "direct-push",
            "changed": True,
            "status": "direct_pushed",
            "pr_url": "",
            "commit": commit_sha,
            "skipped_reason": "",
            "warnings": direct_warnings,
        },
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
