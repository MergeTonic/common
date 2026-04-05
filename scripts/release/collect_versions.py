#!/usr/bin/env python3
import json
from pathlib import Path

import tomllib


def _json_version(path: Path) -> str:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["version"]


def _toml_project_version(path: Path) -> str:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    return data["project"]["version"]


def main() -> int:
    root = Path(".")
    versions = {
        "ts_cli": _json_version(root / "packages/tonic-core/package.json"),
        "js_action": _json_version(root / "agents/github-action-agent-node/package.json"),
        "vsmt": _json_version(root / "extensions/tonic-conflict-resolver/package.json"),
        "py_cli": _toml_project_version(root / "merge-tonic-lib/pyproject.toml"),
        "py_action": _toml_project_version(root / "agents/github-action-agent/pyproject.toml"),
        "hf_weave": _json_version(root / "packages/hf-weave/package.json"),
    }
    print(json.dumps(versions))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
