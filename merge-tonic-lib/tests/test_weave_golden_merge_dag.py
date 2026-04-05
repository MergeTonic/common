"""Golden merge outcomes (criss-cross) for regression against README `merge_states` semantics.

Subprocess ``git merge`` with ``merge=tonic-weave`` is covered in ``test_weave_merge_driver_git`` (Linux CI).
"""

from __future__ import annotations

from tonic import initial_state, merge_states, update_state


def test_criss_cross_concurrent_adds_yield_conflict_markers() -> None:
    """Two branches each add one line after shared base → annotated conflict region."""
    sb = initial_state(["base"])
    left = update_state(sb, ["base", "left"], commit_id="L")
    right = update_state(sb, ["base", "right"], commit_id="R")
    _merged, ann = merge_states(left, right)
    assert any("<<<<<<<" in line for line in ann)
    assert "left" in ann and "right" in ann
