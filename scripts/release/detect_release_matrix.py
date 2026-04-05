#!/usr/bin/env python3
import argparse
import fnmatch
import json
import re
import subprocess
from pathlib import Path


def _ref_resolves(ref: str) -> bool:
    r = subprocess.run(
        ["git", "rev-parse", "--verify", "-q", ref],
        capture_output=True,
        text=True,
    )
    return r.returncode == 0


def _looks_like_git_sha(ref: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-f]{7,40}", ref.lower()))


def _branch_slug_for_fetch(base_ref: str) -> str:
    """Branch path segment for refs/heads/<slug> on origin (not a full ref)."""
    slug = base_ref.strip()
    if slug.startswith("refs/heads/"):
        slug = slug[len("refs/heads/") :]
    if slug.startswith("origin/"):
        slug = slug[len("origin/") :]
    return slug


def _resolve_base_ref(base_ref: str) -> str:
    """Map user/base ref to a commit-ish that exists locally (handles shallow CI checkouts)."""
    if _ref_resolves(base_ref):
        return base_ref
    if base_ref == "HEAD":
        return base_ref
    if _looks_like_git_sha(base_ref):
        raise RuntimeError(f"Cannot resolve base ref {base_ref!r} (missing object in this clone).")

    slug = _branch_slug_for_fetch(base_ref)
    origin_branch = f"origin/{slug}"
    if origin_branch != base_ref and _ref_resolves(origin_branch):
        return origin_branch

    # Typical GitHub Actions: fetch-depth 1 checkout has no local or remote-tracking base branch yet.
    subprocess.run(
        [
            "git",
            "fetch",
            "--no-tags",
            "--depth=1",
            "origin",
            f"+refs/heads/{slug}:refs/remotes/origin/{slug}",
        ],
        check=True,
        text=True,
    )
    if _ref_resolves(origin_branch):
        return origin_branch
    raise RuntimeError(
        f"Cannot resolve base ref {base_ref!r} for git diff (try fetch-depth: 0 on actions/checkout "
        f"or ensure refs/heads/{slug} exists on origin)."
    )


def _resolve_head_ref(head_ref: str) -> str:
    if head_ref == "HEAD" or _ref_resolves(head_ref):
        return head_ref
    raise RuntimeError(f"Cannot resolve head ref {head_ref!r} for git diff.")


def _git_changed_files(base_ref: str, head_ref: str) -> list[str]:
    base = _resolve_base_ref(base_ref)
    head = _resolve_head_ref(head_ref)
    triple = f"{base}...{head}"
    r = subprocess.run(
        ["git", "diff", "--name-only", triple],
        capture_output=True,
        text=True,
    )
    if r.returncode == 0:
        out = r.stdout
    else:
        # Shallow clones: base and head tips may have no recorded merge base; two-dot diff still works.
        err = (r.stderr or "").lower()
        if "no merge base" not in err and "bad revision" not in err:
            r.check_returncode()
        out = subprocess.check_output(
            ["git", "diff", "--name-only", base, head],
            text=True,
        )
    return [line.strip() for line in out.splitlines() if line.strip()]


def _normalize(path: str) -> str:
    return path.replace("\\", "/")


def _matches_any(path: str, patterns: list[str]) -> bool:
    for pattern in patterns:
        if fnmatch.fnmatch(path, pattern):
            return True
    return False


def _release_flags(release_types: list[str]) -> dict[str, bool]:
    kinds = set(release_types)
    return {
        "publish_npm": "npm" in kinds,
        "publish_pypi": "pypi" in kinds,
        "publish_vsix": "vsix" in kinds,
        "sync_repo": "repo_sync" in kinds,
        "publish_github_action": "github_action" in kinds,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-ref", required=True)
    parser.add_argument("--head-ref", required=True)
    parser.add_argument("--targets-file", default="release-targets.json")
    parser.add_argument("--always-include", nargs="*", default=[])
    args = parser.parse_args()

    targets_path = Path(args.targets_file)
    data = json.loads(targets_path.read_text(encoding="utf-8"))
    changed = [_normalize(p) for p in _git_changed_files(args.base_ref, args.head_ref)]
    forced = set(args.always_include)

    selected = []
    for target in data.get("targets", []):
        target_id = target["id"]
        if target.get("selectable", True) is False:
            continue
        patterns = target.get("paths", [])
        is_changed = target_id in forced or any(_matches_any(path, patterns) for path in changed)
        if not is_changed:
            continue

        flags = _release_flags(target.get("release_types", []))
        selected.append(
            {
                "id": target_id,
                "repo": target["repo"],
                "component": target["component"],
                "paths": patterns,
                "release_types": target.get("release_types", []),
                "source_dir": target.get("source_dir", ""),
                "template_dir": target.get("template_dir", ""),
                "version_key": target.get("version_key", ""),
                **flags,
            }
        )

    result = {
        "changed_files": changed,
        "include_count": len(selected),
        "targets": selected,
    }
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
