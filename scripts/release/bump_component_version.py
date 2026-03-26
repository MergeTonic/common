#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path


COMPONENT_FILES = {
    "ts_cli": ("packages/tonic-core/package.json", "json"),
    "js_action": ("agents/github-action-agent-node/package.json", "json"),
    "vsmt": ("extensions/tonic-conflict-resolver/package.json", "json"),
    "py_cli": ("merge-tonic-lib/pyproject.toml", "toml"),
    "py_action": ("agents/github-action-agent/pyproject.toml", "toml"),
}


def _bump_patch(version: str) -> str:
    major, minor, patch = version.split(".")
    return f"{major}.{minor}.{int(patch) + 1}"


def _update_json(path: Path, explicit_version: str | None) -> tuple[str, str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    old = data["version"]
    new = explicit_version or _bump_patch(old)
    data["version"] = new
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return old, new


def _update_toml(path: Path, explicit_version: str | None) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8")
    old_match = re.search(r'^version = "([^"]+)"$', text, re.MULTILINE)
    if old_match is None:
        raise ValueError(f"Could not find version in {path}")
    old = old_match.group(1)
    new = explicit_version or _bump_patch(old)
    updated = re.sub(r'^version = "([^"]+)"$', f'version = "{new}"', text, count=1, flags=re.MULTILINE)
    path.write_text(updated, encoding="utf-8")
    return old, new


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--component", choices=COMPONENT_FILES.keys(), required=True)
    parser.add_argument("--version", default="")
    args = parser.parse_args()

    target_file, kind = COMPONENT_FILES[args.component]
    path = Path(target_file)
    explicit = args.version or None

    if kind == "json":
        old, new = _update_json(path, explicit)
    else:
        old, new = _update_toml(path, explicit)

    print(json.dumps({"component": args.component, "file": target_file, "old": old, "new": new}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
