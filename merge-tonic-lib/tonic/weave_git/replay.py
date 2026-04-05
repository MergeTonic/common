"""Replay weave state along text history: `update_state` per commit; optional checkpoints."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

from tonic import update_state
from tonic.core.state import deserialize_state

from .hashutil import sha256_hex_bytes
from .manifest import parse_manifest_json


@dataclass
class ReplayStep:
    commit: str
    lines: list[str]


def persist_checkpoint_weave_blob(weave_root: Path, serialized: str) -> str:
    """Write full serialized weave under `weave_root/blobs/{weave_serialized_sha}` (idempotent)."""
    h = sha256_hex_bytes(serialized.encode("utf-8"))
    d = weave_root / "blobs"
    d.mkdir(parents=True, exist_ok=True)
    out = d / h
    raw = serialized.encode("utf-8")
    if not out.is_file():
        out.write_bytes(raw)
    return h


def replay_steps(
    steps: Iterable[ReplayStep],
    *,
    start_state: str | None = None,
    checkpoint_every: int = 0,
    on_checkpoint: Callable[[str, str], None] | None = None,
) -> tuple[str, list[str]]:
    """Return (final_serialized_state, checkpoint_commits_when_recorded).

    When ``checkpoint_every > 0`` and ``on_checkpoint`` is set, each checkpoint invokes
    ``on_checkpoint(commit_id, serialized_state)`` after ``update_state`` (full weave snapshot).
    """
    state = "" if start_state is None else start_state
    checkpoints: list[str] = []
    for n, step in enumerate(steps, start=1):
        state = update_state(state, step.lines, commit_id=step.commit)
        if checkpoint_every and n % checkpoint_every == 0:
            checkpoints.append(step.commit)
            if on_checkpoint is not None:
                on_checkpoint(step.commit, state)
    return state, checkpoints


def verify_replay_matches_manifest(
    manifest_json: str,
    path: str,
    steps: list[ReplayStep],
    *,
    checkpoint_every: int = 0,
) -> bool:
    data = parse_manifest_json(manifest_json)
    paths = data.get("paths", {})
    entry = paths.get(path)
    if not isinstance(entry, dict):
        return False
    want = entry.get("weave_serialized_sha")
    if not isinstance(want, str):
        return False
    final_s, _ = replay_steps(steps, checkpoint_every=checkpoint_every)
    got = sha256_hex_bytes(final_s.encode("utf-8"))
    return got == want


def state_hash(state_serialized: str) -> str:
    return sha256_hex_bytes(state_serialized.encode("utf-8"))


def deserialize_with_cap(raw: str, max_bytes: int) -> object:
    if len(raw.encode("utf-8")) > max_bytes:
        raise ValueError("weave payload exceeds max_bytes")
    return deserialize_state(raw)
