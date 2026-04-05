"""weave replay --publish-ctrd updates manifest replay_trace_key (mocked Hub)."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from tonic import update_state
from tonic.weave_git.manifest import parse_manifest_json, path_entry_for_file, serialize_manifest_json
from tonic.weave_git.replay_publish import replay_and_publish_ctrd
from tonic.weave_git.weave_cli import cmd_weave_replay


def _git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)


def test_replay_and_publish_ctrd_is_callable() -> None:
    assert callable(replay_and_publish_ctrd)


def test_weave_replay_publish_ctrd_writes_manifest_key(tmp_path: Path, monkeypatch) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init")
    _git(repo, "config", "user.email", "t@t.c")
    _git(repo, "config", "user.name", "t")

    lines1 = ["x"]
    st = update_state("", lines1, commit_id="c1")
    lines2 = ["x", "y"]
    st2 = update_state(st, lines2, commit_id="c2")
    text = "\n".join(lines2) + "\n"
    _, entry = path_entry_for_file(
        rel_path="p",
        text_canonical=text,
        serialized_weave=st2,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
    )
    man = {
        "schema": "tonic-git-manifest",
        "version": "1",
        "commit": "0000000000000000000000000000000000000000",
        "paths": {"p": entry},
    }
    wr = repo / ".tonic" / "weave"
    wr.mkdir(parents=True)
    (wr / "manifest.json").write_text(serialize_manifest_json(man), encoding="utf-8")

    steps_path = tmp_path / "steps.json"
    steps_path.write_text(
        json.dumps(
            [
                {"commit": "c1", "lines": lines1},
                {"commit": "c2", "lines": lines2},
            ]
        ),
        encoding="utf-8",
    )

    (repo / "dummy.txt").write_text("init", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "init")

    captured: list[tuple[str, dict]] = []

    def fake_publish(*, repo_id: str, doc: dict, offline: bool | None = None) -> str:
        _ = offline
        captured.append((repo_id, doc))
        return str(doc["ctrd_id"])

    monkeypatch.setenv("TONIC_HF_WEAVE_REPO", "org/dataset")
    monkeypatch.delenv("HF_HUB_OFFLINE", raising=False)
    monkeypatch.delenv("TONIC_HF_WEAVE_OFFLINE", raising=False)
    monkeypatch.setattr("tonic.hf_weave.ctrd.hub_offline", lambda _o=None: False)
    monkeypatch.setattr("tonic.hf_weave.ctrd.publish_ctrd_to_hub", fake_publish)

    args = argparse.Namespace(
        repo=str(repo),
        manifest="",
        path="p",
        steps_json=str(steps_path),
        trace_key="",
        from_hub=False,
        repo_id="",
        checkpoint_every=0,
        persist_checkpoints="",
        json_out=False,
        publish_ctrd=True,
    )
    assert cmd_weave_replay(args) == 0
    assert len(captured) == 1
    rid, doc = captured[0]
    assert rid == "org/dataset"
    assert len(doc.get("ctrd_id", "")) == 64

    updated = parse_manifest_json((wr / "manifest.json").read_text(encoding="utf-8"))
    rk = updated["paths"]["p"].get("replay_trace_key")
    assert isinstance(rk, str) and len(rk) == 64
    assert rk == doc["ctrd_id"]
    assert len(updated["commit"]) == 40


def test_replay_from_hub_resolves_repo_id_via_hf_repo_json(tmp_path: Path, monkeypatch) -> None:
    """When profile has no hub_repo_id, .tonic/hf-repo.json supplies Hub model id (TS parity)."""
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init")
    _git(repo, "config", "user.email", "t@t.c")
    _git(repo, "config", "user.name", "t")

    trace = "a" * 64
    lines1 = ["x"]
    st = update_state("", lines1, commit_id="c1")
    lines2 = ["x", "y"]
    st2 = update_state(st, lines2, commit_id="c2")
    text = "\n".join(lines2) + "\n"
    _, entry = path_entry_for_file(
        rel_path="p",
        text_canonical=text,
        serialized_weave=st2,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
    )
    entry = {**entry, "replay_trace_key": trace}
    man = {
        "schema": "tonic-git-manifest",
        "version": "1",
        "commit": "0000000000000000000000000000000000000000",
        "paths": {"p": entry},
    }
    wr = repo / ".tonic" / "weave"
    wr.mkdir(parents=True)
    (wr / "manifest.json").write_text(serialize_manifest_json(man), encoding="utf-8")
    hfj = repo / ".tonic" / "hf-repo.json"
    hfj.parent.mkdir(parents=True, exist_ok=True)
    hfj.write_text(json.dumps({"repo_id": "json-only/model"}), encoding="utf-8")

    (repo / "dummy.txt").write_text("init", encoding="utf-8")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-m", "init")

    seen: list[str] = []

    def fake_fetch(*, repo_id: str, ctrd_id: str):
        seen.append(repo_id)
        assert ctrd_id == trace
        return {
            "schema": "tonic-weave-trace-replay",
            "version": "1",
            "manifest_commit": man["commit"],
            "path": "p",
            "steps": [{"commit": "c1", "lines": lines1}, {"commit": "c2", "lines": lines2}],
            "diff_engine_id": "tonic-v1",
            "weave_format_version": "1",
            "ctrd_id": trace,
        }

    monkeypatch.delenv("TONIC_HF_WEAVE_REPO", raising=False)
    monkeypatch.delenv("HF_WEAVE_HUB_REPO", raising=False)
    monkeypatch.setattr("tonic.hf_weave.ctrd.fetch_ctrd_from_hub", fake_fetch)

    code = replay_and_publish_ctrd(
        repo=repo,
        manifest_path=None,
        path="p",
        steps_json="",
        trace_key="",
        from_hub=True,
        publish_ctrd_flag=False,
        hub_repo_id_arg="",
    )
    assert code == 0
    assert seen == ["json-only/model"]
