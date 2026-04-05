"""merge-tonic weave sync delegates to mergetonic_hf_weave when installed."""

from __future__ import annotations

import argparse
import sys
import types

import pytest

from tonic.weave_git import weave_cli


def test_cmd_weave_sync_forwards_argv(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[list[str]] = []

    def fake_main(argv: list[str] | None = None) -> int:
        seen.append(list(argv if argv is not None else []))
        return 0

    pkg = types.ModuleType("mergetonic_hf_weave")
    cli_mod = types.ModuleType("mergetonic_hf_weave.cli")
    cli_mod.main = fake_main
    monkeypatch.setitem(sys.modules, "mergetonic_hf_weave", pkg)
    monkeypatch.setitem(sys.modules, "mergetonic_hf_weave.cli", cli_mod)

    args = argparse.Namespace(sync_rest=["--", "--repo", ".", "--dry-run"])
    assert weave_cli.cmd_weave_sync(args) == 0
    assert seen == [["sync", "--repo", ".", "--dry-run"]]
