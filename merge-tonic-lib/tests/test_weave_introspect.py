from __future__ import annotations

import pytest

from tonic import current_lines, initial_state, update_state
from tonic.core.state import deserialize_state
from tonic.core.weave_introspect import (
    WeaveIntrospectError,
    build_visible_weave_maps,
    inspect_rows_json,
    split_weave_index_after_visible,
    visible_line_count,
    visible_range_to_weave_indices,
)


def test_no_tombstones_mapping_is_identity_like() -> None:
    raw = initial_state(["a", "b", "c"])
    rows = deserialize_state(raw)
    views, v2w, _ = build_visible_weave_maps(rows)
    assert visible_line_count(rows) == 3
    assert v2w == [0, 1, 2]
    for v in views:
        assert v.visible_line == v.weave_index + 1


def test_tombstone_shifts_visible_vs_weave() -> None:
    s0 = initial_state(["a", "b"])
    s1 = update_state(s0, ["b"], commit_id="c1")
    rows = deserialize_state(s1)
    assert current_lines(s1) == ["b"]
    assert len(rows) == 2
    _, v2w, w2v = build_visible_weave_maps(rows)
    assert not rows[0][3] % 2
    assert rows[1][3] % 2
    assert v2w == [1]
    assert 0 not in w2v
    assert w2v[1] == 1
    assert visible_range_to_weave_indices(rows, 1, 1) == [1]


def test_duplicate_line_text_mapping_by_index() -> None:
    raw = initial_state(["dup", "dup"])
    rows = deserialize_state(raw)
    views, _, w2v = build_visible_weave_maps(rows)
    assert len(views) == 2
    assert w2v[0] == 1 and w2v[1] == 2


def test_visible_range_errors() -> None:
    raw = initial_state(["only"])
    rows = deserialize_state(raw)
    with pytest.raises(WeaveIntrospectError):
        visible_range_to_weave_indices(rows, 1, 2)
    with pytest.raises(WeaveIntrospectError):
        visible_range_to_weave_indices(rows, 0, 1)


def test_split_weave_index_after_visible() -> None:
    s0 = initial_state(["a", "b"])
    s1 = update_state(s0, ["b"], commit_id="c1")
    rows = deserialize_state(s1)
    assert split_weave_index_after_visible(rows, 0) == 0
    assert split_weave_index_after_visible(rows, 1) == len(rows)


def test_inspect_rows_json_shape() -> None:
    raw = initial_state(["z"])
    j = inspect_rows_json(deserialize_state(raw))
    assert "rows" in j and "visible_to_weave" in j and "weave_to_visible" in j
    assert j["rows"][0]["visible_line"] == 1
