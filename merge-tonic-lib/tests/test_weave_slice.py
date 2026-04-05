from __future__ import annotations

import pytest

from tonic import current_lines, initial_state, merge_states, update_state
from tonic.core.state import deserialize_state
from tonic.core.weave_introspect import split_weave_index_after_visible
from tonic.core.weave_slice import WeaveExtractError, WeaveSpliceError, extract_weave_rows, splice_weave_rows


def test_extract_full_state_round_trip() -> None:
    raw = initial_state(["a", "b", "c"])
    rows = deserialize_state(raw)
    ex = extract_weave_rows(raw, 0, len(rows))
    assert ex == raw


def test_extract_invalid_range_raises() -> None:
    raw = initial_state(["a"])
    with pytest.raises(WeaveExtractError):
        extract_weave_rows(raw, 0, 5)
    with pytest.raises(WeaveExtractError):
        extract_weave_rows(raw, 0, 0)


def test_extract_mid_slice_may_fail_or_succeed() -> None:
    raw = initial_state(["a", "b", "c"])
    rows = deserialize_state(raw)
    mid = extract_weave_rows(raw, 1, 2)
    assert current_lines(mid) == ["b"]


def test_splice_append_fragment() -> None:
    t = initial_state(["a"])
    f = initial_state(["b"])
    n = len(deserialize_state(t))
    out = splice_weave_rows(t, f, n)
    assert current_lines(out) == ["a", "b"]


def test_splice_before_first() -> None:
    t = initial_state(["a"])
    f = initial_state(["b"])
    out = splice_weave_rows(t, f, 0)
    assert current_lines(out) == ["b", "a"]


def test_splice_after_visible_index() -> None:
    t = initial_state(["a", "b"])
    f = initial_state(["z"])
    rows = deserialize_state(t)
    split = split_weave_index_after_visible(rows, 1)
    out = splice_weave_rows(t, f, split)
    assert current_lines(out) == ["a", "z", "b"]


def test_splice_merge_smoke() -> None:
    left = initial_state(["x"])
    right = initial_state(["y"])
    merged, _ann = merge_states(left, right)
    assert "x" in current_lines(merged) and "y" in current_lines(merged)
