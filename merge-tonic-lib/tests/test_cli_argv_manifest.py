from __future__ import annotations

import json
from pathlib import Path


def test_cli_argv_manifest_is_valid_json() -> None:
    root = Path(__file__).resolve().parents[2]
    p = root / "scripts" / "weave" / "cli_argv_manifest.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    assert data.get("schema")
    subs = data.get("weave_subcommands")
    assert isinstance(subs, list) and len(subs) >= 3
    for row in subs:
        assert "name" in row and "argv" in row


def test_repo_cli_argv_manifest_is_valid_json() -> None:
    root = Path(__file__).resolve().parents[2]
    p = root / "scripts" / "repo" / "cli_argv_manifest.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    assert data.get("schema")
    subs = data.get("repo_subcommands")
    assert isinstance(subs, list) and len(subs) >= 2
    for row in subs:
        assert "name" in row and "argv" in row
