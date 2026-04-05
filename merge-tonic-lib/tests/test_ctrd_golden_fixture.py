"""CTRD golden fixture stays aligned with TS @mergetonic/hf-weave parity test."""

from __future__ import annotations

import json
from pathlib import Path

from tonic.hf_weave.ctrd import ctrd_id_from_payload


def _assert_fixture_matches(name: str) -> None:
    root = Path(__file__).resolve().parent / "fixtures" / name
    data = json.loads(root.read_text(encoding="utf-8"))
    payload = data["payload"]
    assert ctrd_id_from_payload(payload) == data["ctrd_id"]


def test_ctrd_golden_fixture_matches_computed_id() -> None:
    _assert_fixture_matches("ctrd_golden.json")


def test_ctrd_golden_unicode_fixture_matches_computed_id() -> None:
    _assert_fixture_matches("ctrd_golden_unicode.json")
