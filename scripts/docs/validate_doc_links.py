#!/usr/bin/env python3
"""Validate canonical documentation links across manifests and readmes."""

from __future__ import annotations

import json
import sys
from pathlib import Path


DOCMAP_PATH = Path("wiki-src/_DocMap.json")

REQUIRED_COMPONENT_IDS = {"common", "tsmt", "mtpy", "js-action", "py-action", "vsmt"}

README_EXPECTATIONS = {
    "packages/tonic-core/README.md": "Core-TS-%40mergetonic-core",
    "agents/github-action-agent/README.md": "GitHub-Agent-Python",
    "agents/github-action-agent-node/README.md": "GitHub-Agent-Node",
    "target-repo-templates/tsmt/README.md": "Core-TS-%40mergetonic-core",
    "target-repo-templates/mtpy/README.md": "Core-Python-mergetonic",
    "target-repo-templates/js-action/README.md": "GitHub-Agent-Node",
    "target-repo-templates/py-action/README.md": "GitHub-Agent-Python",
    "target-repo-templates/vsmt/README.md": "VSCode-Extension",
}

MANIFEST_EXPECTATIONS = {
    "packages/tonic-core/package.json": ["homepage", "repository", "bugs"],
    "agents/github-action-agent-node/package.json": ["homepage", "repository", "bugs"],
    "extensions/tonic-conflict-resolver/package.json": ["homepage", "repository", "bugs"],
    "merge-tonic-lib/pyproject.toml": ["Documentation", "Repository", "Issues"],
    "agents/github-action-agent/pyproject.toml": ["Documentation", "Repository", "Issues"],
}


def fail(msg: str, failures: list[str]) -> None:
    failures.append(msg)


def validate_docmap(failures: list[str]) -> None:
    if not DOCMAP_PATH.exists():
        fail("missing wiki-src/_DocMap.json", failures)
        return
    docmap = json.loads(DOCMAP_PATH.read_text(encoding="utf-8"))
    missing = REQUIRED_COMPONENT_IDS - set(docmap.keys())
    if missing:
        fail(f"_DocMap missing component ids: {sorted(missing)}", failures)


def validate_readmes(failures: list[str]) -> None:
    for path_str, required_slug in README_EXPECTATIONS.items():
        path = Path(path_str)
        if not path.exists():
            fail(f"missing README: {path_str}", failures)
            continue
        text = path.read_text(encoding="utf-8")
        if "common/wiki" not in text:
            fail(f"{path_str} missing canonical wiki reference", failures)
        if required_slug not in text:
            fail(f"{path_str} missing expected canonical slug {required_slug}", failures)


def validate_manifests(failures: list[str]) -> None:
    for path_str, required_tokens in MANIFEST_EXPECTATIONS.items():
        path = Path(path_str)
        if not path.exists():
            fail(f"missing manifest: {path_str}", failures)
            continue
        text = path.read_text(encoding="utf-8")
        for token in required_tokens:
            if token not in text:
                fail(f"{path_str} missing required docs metadata token '{token}'", failures)


def main() -> int:
    failures: list[str] = []
    validate_docmap(failures)
    validate_readmes(failures)
    validate_manifests(failures)
    if failures:
        print("documentation validation failed:")
        for msg in failures:
            print(f"- {msg}")
        return 1
    print("documentation validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
