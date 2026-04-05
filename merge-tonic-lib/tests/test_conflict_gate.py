"""Unit tests for tonic.hydration.conflict_gate (parity with TS conflictGate.test.ts)."""

from __future__ import annotations

from tonic.ast_grep_hydrate import EXIT_OK, EXIT_PARTIAL
from tonic.hydration.conflict_gate import evaluate_conflict_gate


def test_default_continues_any_count() -> None:
    r0 = evaluate_conflict_gate({}, 0)
    assert r0["should_stop"] is False
    assert r0["exit_code"] == EXIT_OK
    assert r0["outcome"]["action"] == "continue"

    r3 = evaluate_conflict_gate({}, 3)
    assert r3["should_stop"] is False
    assert r3["exit_code"] == EXIT_OK


def test_zero_stop_stops_when_zero_regions() -> None:
    r = evaluate_conflict_gate({"TONIC_CONFLICT_GATE": "zero_stop"}, 0)
    assert r["should_stop"] is True
    assert r["exit_code"] == EXIT_PARTIAL
    assert r["outcome"]["policy"] == "zero_stop"
    assert r["outcome"]["action"] == "stop"
    assert "zero" in (r["outcome"].get("stop_reason") or "")


def test_zero_stop_continues_when_regions() -> None:
    r = evaluate_conflict_gate({"TONIC_CONFLICT_GATE": "zero_stop"}, 1)
    assert r["should_stop"] is False
    assert r["exit_code"] == EXIT_OK


def test_skip_conflict_gate() -> None:
    r = evaluate_conflict_gate(
        {"TONIC_CONFLICT_GATE": "zero_stop", "TONIC_SKIP_CONFLICT_GATE": "1"},
        0,
    )
    assert r["should_stop"] is False
    assert r["exit_code"] == EXIT_OK
    assert r["outcome"]["policy"] == "skipped"
