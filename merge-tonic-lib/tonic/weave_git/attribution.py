"""Blame-style sidecar keyed by `weave_serialized_sha` (provenance alignment with tree merge rules)."""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path
from typing import Any

from tonic.core.state import deserialize_state

from .replay import state_hash


def _normalize_provenance_token(s: str) -> str:
    """UTF-8 NFC for cross-platform parity with `tree.py` tie-break rules."""
    return unicodedata.normalize("NFC", s)


def attribution_lines_from_weave_serialized(serialized: str) -> list[dict[str, Any]]:
    """One row per visible line from weave state: text + provenance commit ids."""
    rows: list[dict[str, Any]] = []
    for row in deserialize_state(serialized):
        if len(row) == 4:
            line, _depth, _anchored_right, count = row
            provenance: list[str] = []
        else:
            line, _depth, _anchored_right, count, provenance = row
        if count % 2:
            rows.append(
                {
                    "line": line,
                    "provenance": [_normalize_provenance_token(p) for p in provenance],
                }
            )
    return rows


def build_sidecar_from_weave_serialized(serialized: str) -> dict[str, Any]:
    """Populate ``lines`` from weave rows (live lines only)."""
    return build_sidecar_v1(
        weave_serialized_sha=state_hash(serialized),
        lines=attribution_lines_from_weave_serialized(serialized),
    )


def build_sidecar_v1(
    *,
    weave_serialized_sha: str,
    lines: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "schema": "tonic-weave-attribution-v1",
        "version": "1",
        "weave_serialized_sha": weave_serialized_sha,
        "lines": lines,
    }


def save_sidecar(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_sidecar(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return d if isinstance(d, dict) else None
