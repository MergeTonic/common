"""JSON stdin/stdout helper for TS–Python parity: one op per request.

Merge / state ops stay aligned with @mergetonic/core and @tonic. Marker-branch and
Git-comment chunking are validated in the GitHub agent packages (Node + Python tests).
"""

from __future__ import annotations

import json
import sys

from tonic import current_lines, initial_state, merge_states, update_state


def main() -> None:
    data = json.load(sys.stdin)
    op = data.get("op")
    if op == "merge_snapshots":
        left: list[str] = data["left"]
        right: list[str] = data["right"]
        state, annotated = merge_states(initial_state(left), initial_state(right))
        json.dump(
            {"state": state, "annotated": annotated, "current": current_lines(state)},
            sys.stdout,
        )
        return
    if op == "merge_states":
        state1: str = data["state1"]
        state2: str = data["state2"]
        state, annotated = merge_states(state1, state2)
        json.dump(
            {"state": state, "annotated": annotated, "current": current_lines(state)},
            sys.stdout,
        )
        return
    if op == "update_state":
        raw: str = data["raw_state"]
        lines: list[str] = data["lines"]
        out = update_state(raw, lines)
        json.dump({"state": out}, sys.stdout)
        return
    raise SystemExit(f"unknown op: {op!r}")


if __name__ == "__main__":
    main()
