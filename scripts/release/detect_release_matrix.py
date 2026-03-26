#!/usr/bin/env python3
import argparse
import fnmatch
import json
import subprocess
from pathlib import Path


def _git_changed_files(base_ref: str, head_ref: str) -> list[str]:
    cmd = ["git", "diff", "--name-only", f"{base_ref}...{head_ref}"]
    output = subprocess.check_output(cmd, text=True)
    return [line.strip() for line in output.splitlines() if line.strip()]


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
