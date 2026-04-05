"""hf weave sync CLI — dry-run, ordering, offline."""

from __future__ import annotations

from pathlib import Path

import pytest

from mergetonic_hf_weave.cli import main


def test_sync_dry_run_offline_no_publish_prints_planned(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    calls: list[str] = []

    def no_push(*_a, **_k) -> int:
        calls.append("push")
        return 0

    monkeypatch.setattr("mergetonic_hf_weave.cli._hub_push_blobs_and_maybe_index", no_push)
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    rc = main(["sync", "--repo", str(tmp_path), "--offline", "--dry-run"])
    assert rc == 0
    assert calls == []


def test_sync_order_publish_then_push_then_index(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    order: list[str] = []

    def fake_replay(_args, **_k) -> int:
        order.append("replay")
        return 0

    def fake_push(*_a, **_k) -> int:
        order.append("push")
        return 0

    def fake_refresh(*_a, **_k) -> dict:
        order.append("index")
        return {}

    monkeypatch.setattr("tonic.weave_git.replay_publish.replay_and_publish_ctrd_from_args", fake_replay)
    monkeypatch.setattr("mergetonic_hf_weave.cli._hub_push_blobs_and_maybe_index", fake_push)
    monkeypatch.setattr("tonic.hf_weave.hub_index.refresh_weave_hub_index", fake_refresh)

    (tmp_path / ".tonic").mkdir(parents=True)
    (tmp_path / ".tonic" / "hf-repo.json").write_text('{"repo_id": "org/model"}\n', encoding="utf-8")

    rc = main(
        [
            "sync",
            "--repo",
            str(tmp_path),
            "--publish-ctrd",
            "--replay-path",
            "p",
            "--manifest",
            str(tmp_path / ".tonic" / "weave" / "manifest.json"),
            "--update-index",
        ]
    )
    assert rc == 0
    assert order == ["replay", "push", "index"]


def test_sync_publish_requires_replay_path(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    rc = main(["sync", "--repo", str(tmp_path), "--offline", "--publish-ctrd"])
    assert rc == 1
