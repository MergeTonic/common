"""Byte-stable JSON vs fixture for build_intent_hydration (TS parity test uses same file)."""

from __future__ import annotations

import json
from pathlib import Path

from tonic.hydration.build_intent_hydration import build_intent_hydration

_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "intent_hydration_byte_golden.min.json"
_RICH = Path(__file__).resolve().parent / "fixtures" / "intent_hydration_byte_golden_rich.min.json"


def test_intent_hydration_matches_byte_golden() -> None:
    expected = _FIXTURE.read_text(encoding="utf-8").strip()
    out = build_intent_hydration(
        bootstrap={"left_intent": "L", "right_intent": "R"},
        refinement=None,
        conflicts={"conflict_regions": []},
        ast=None,
    )
    got = json.dumps(out, sort_keys=True, separators=(",", ":"))
    assert got == expected


def test_intent_hydration_rich_byte_golden() -> None:
    expected = _RICH.read_text(encoding="utf-8").strip()
    out = build_intent_hydration(
        bootstrap={
            "schema": "tonic-hydration-intent-bootstrap",
            "version": "1",
            "left_intent": "L",
            "right_intent": "R",
            "sources": {},
        },
        refinement=None,
        conflicts={
            "schema": "tonic-conflict-context",
            "version": "1",
            "scan_scope": "full",
            "conflict_regions": [
                {"path": "z.ts", "region_id": "c1", "start_line": 1, "end_line": 2, "mid_line": 1}
            ],
        },
        ast={"matches": [{"path": "a.ts", "rule_id": "rule-a", "start": {"line": 1}, "end": {"line": 2}}]},
        retrieval={
            "hits": [
                {
                    "chunk_id": "h1",
                    "text": "t",
                    "score": 0.5,
                    "metadata": {"path": "b.ts", "start_line": 1, "end_line": 2},
                }
            ]
        },
    )
    got = json.dumps(out, sort_keys=True, separators=(",", ":"))
    assert got == expected
