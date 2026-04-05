from __future__ import annotations

from tonic import update_state
from tonic.weave_git.hashutil import sha256_hex_bytes
from tonic.weave_git.manifest import path_entry_for_file, serialize_manifest_json
from tonic.weave_git.replay import (
    ReplayStep,
    persist_checkpoint_weave_blob,
    replay_steps,
    state_hash,
    verify_replay_matches_manifest,
)


def test_replay_matches_manifest_hash() -> None:
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
        "commit": "head",
        "paths": {"p": entry},
    }
    raw = serialize_manifest_json(man)
    steps = [
        ReplayStep(commit="c1", lines=lines1),
        ReplayStep(commit="c2", lines=lines2),
    ]
    assert verify_replay_matches_manifest(raw, "p", steps)


def test_checkpoint_emits_commits() -> None:
    steps = [ReplayStep(commit=f"c{i}", lines=[str(i)]) for i in range(5)]
    _, cps = replay_steps(steps, checkpoint_every=2)
    assert cps


def test_replay_tombstone_chain_matches_chained_update() -> None:
    st = update_state("", ["a", "b"])
    st = update_state(st, ["b"], commit_id="c2")
    steps = [ReplayStep(commit="c1", lines=["a", "b"]), ReplayStep(commit="c2", lines=["b"])]
    final, _ = replay_steps(steps)
    assert final == st
    assert state_hash(final) == state_hash(st)


def test_replay_duplicate_line_content_stable() -> None:
    st = update_state("", ["same", "same"], commit_id="a")
    st = update_state(st, ["same", "between", "same"], commit_id="b")
    steps = [
        ReplayStep(commit="a", lines=["same", "same"]),
        ReplayStep(commit="b", lines=["same", "between", "same"]),
    ]
    final, _ = replay_steps(steps)
    assert final == st


def test_replay_single_step_matches_update_from_empty() -> None:
    """Replay from ``""`` matches ``update_state("", snapshot)`` (canonical CTRD chain)."""
    steps = [ReplayStep(commit="c1", lines=["only"])]
    final, _ = replay_steps(steps)
    assert final == update_state("", ["only"], commit_id="c1")


def test_checkpoint_persist_writes_blobs(tmp_path) -> None:
    from pathlib import Path

    weave_root = Path(tmp_path) / "weave"
    steps = [
        ReplayStep(commit="c1", lines=["a"]),
        ReplayStep(commit="c2", lines=["a", "b"]),
    ]

    def on_cp(_commit: str, ser: str) -> None:
        persist_checkpoint_weave_blob(weave_root, ser)

    final, _cps = replay_steps(steps, checkpoint_every=1, on_checkpoint=on_cp)
    blobs = list((weave_root / "blobs").iterdir())
    assert len(blobs) >= 1
    assert final
