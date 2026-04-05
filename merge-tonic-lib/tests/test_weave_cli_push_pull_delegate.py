"""merge-tonic weave push/pull forward argv to mergetonic_hf_weave.cli.main."""

from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

from tonic.weave_git import weave_cli


def _install_fake_hf_cli(monkeypatch, fake_main) -> None:
    fake_mod = ModuleType("mergetonic_hf_weave.cli")
    fake_mod.main = fake_main  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "mergetonic_hf_weave.cli", fake_mod)
    monkeypatch.setitem(sys.modules, "mergetonic_hf_weave", ModuleType("mergetonic_hf_weave"))


def test_weave_push_forwards_argv(monkeypatch) -> None:
    seen: list[list[str]] = []

    def fake_main(argv: list[str]) -> int:
        seen.append(list(argv))
        return 0

    _install_fake_hf_cli(monkeypatch, fake_main)
    args = SimpleNamespace(push_rest=["--update-index", "--repo", "."])
    assert weave_cli.cmd_weave_push(args) == 0
    assert seen == [["push", "--update-index", "--repo", "."]]


def test_weave_pull_strips_leading_double_dash(monkeypatch) -> None:
    seen: list[list[str]] = []

    def fake_main(argv: list[str]) -> int:
        seen.append(list(argv))
        return 0

    _install_fake_hf_cli(monkeypatch, fake_main)
    args = SimpleNamespace(pull_rest=["--", "--from-index"])
    assert weave_cli.cmd_weave_pull(args) == 0
    assert seen == [["pull", "--from-index"]]


def test_weave_sync_forwards_argv(monkeypatch) -> None:
    seen: list[list[str]] = []

    def fake_main(argv: list[str]) -> int:
        seen.append(list(argv))
        return 0

    _install_fake_hf_cli(monkeypatch, fake_main)
    args = SimpleNamespace(sync_rest=["--dry-run"])
    assert weave_cli.cmd_weave_sync(args) == 0
    assert seen == [["sync", "--dry-run"]]
