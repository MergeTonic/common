"""Optional ``merge_manifest.json`` beside ``base.state`` / ``ours.state`` / ``theirs.state`` for git merge driver."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping


def load_merge_manifest_sidecar(
    state_root: Path,
    *,
    default_weave_format_version: str,
    default_diff_engine_id: str,
) -> tuple[str, str, Mapping[str, Any] | None, Mapping[str, Any] | None, Mapping[str, Any] | None]:
    """Parse ``merge_manifest.json`` if present.

    When the file is missing or invalid, returns defaults and three ``None`` manifest entries.

    File shape::
        {
          "weave_format_version": "1",   // optional; wins over env when present
          "diff_engine_id": "tonic-v1", // optional; wins over env when present
          "entries": {
            "base": { ... PathManifestEntry fields ... } | null,
            "ours": { ... },
            "theirs": { ... }
          }
        }

    Omitted or null entry slots are passed as ``None`` to ``run_option_a_merge``.
    """
    path = state_root / "merge_manifest.json"
    if not path.is_file():
        return (
            default_weave_format_version,
            default_diff_engine_id,
            None,
            None,
            None,
        )
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeError):
        return (
            default_weave_format_version,
            default_diff_engine_id,
            None,
            None,
            None,
        )
    if not isinstance(raw, dict):
        return (
            default_weave_format_version,
            default_diff_engine_id,
            None,
            None,
            None,
        )

    wfv = raw.get("weave_format_version")
    wfv_s = wfv.strip() if isinstance(wfv, str) and wfv.strip() else default_weave_format_version
    de = raw.get("diff_engine_id")
    de_s = de.strip() if isinstance(de, str) and de.strip() else default_diff_engine_id

    entries = raw.get("entries")
    if not isinstance(entries, dict):
        return (wfv_s, de_s, None, None, None)

    def one(key: str) -> Mapping[str, Any] | None:
        v = entries.get(key)
        if v is None:
            return None
        if not isinstance(v, dict):
            return None
        return v

    return (wfv_s, de_s, one("base"), one("ours"), one("theirs"))
