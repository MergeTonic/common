"""Conflicts-first gate (parity with TS conflictGate.ts)."""

from __future__ import annotations

from typing import Any

from tonic.ast_grep_hydrate import EXIT_OK, EXIT_PARTIAL


def evaluate_conflict_gate(
    env: dict[str, str],
    conflict_region_count: int,
) -> dict[str, Any]:
    """Return dict with keys outcome (serializable), should_stop (bool), exit_code (int)."""
    if (env.get("TONIC_SKIP_CONFLICT_GATE") or "").strip() == "1":
        return {
            "outcome": {
                "policy": "skipped",
                "conflict_region_count": conflict_region_count,
                "action": "continue",
                "stop_reason": "TONIC_SKIP_CONFLICT_GATE=1",
            },
            "should_stop": False,
            "exit_code": EXIT_OK,
        }

    policy = (env.get("TONIC_CONFLICT_GATE") or "").strip().lower()
    if policy == "zero_stop" and conflict_region_count == 0:
        return {
            "outcome": {
                "policy": "zero_stop",
                "conflict_region_count": 0,
                "action": "stop",
                "stop_reason": "zero conflict regions under TONIC_CONFLICT_GATE=zero_stop",
            },
            "should_stop": True,
            "exit_code": EXIT_PARTIAL,
        }

    return {
        "outcome": {
            "policy": policy or "default",
            "conflict_region_count": conflict_region_count,
            "action": "continue",
        },
        "should_stop": False,
        "exit_code": EXIT_OK,
    }
