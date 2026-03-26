from tonic_agent.head_line_map import (
    conflict_region_to_head_line,
    conflict_region_to_head_span,
    conflict_region_to_head_span_result,
    find_sublist_start,
)
from tonic_agent.models import ConflictRegion


def test_find_sublist_start():
    assert find_sublist_start(["a", "b", "c"], ["b", "c"]) == 1
    assert find_sublist_start(["x"], ["y"]) is None


def test_conflict_region_to_head_line_matches_right():
    right = ["keep", "one", "two", "three"]
    reg = ConflictRegion(
        base_content="",
        left_content="old",
        right_content="two\nthree",
        start_line=1,
        end_line=5,
        conflict_kind="added left",
    )
    # first occurrence of ["two", "three"] is at 0-based index 2 → line 3
    assert conflict_region_to_head_line(reg, right) == 3


def test_conflict_region_fallback():
    right = ["only"]
    reg = ConflictRegion(
        base_content="",
        left_content="",
        right_content="",
        start_line=1,
        end_line=2,
        conflict_kind="added both",
    )
    assert conflict_region_to_head_line(reg, right) == 1


def test_conflict_region_to_head_span_ambiguous():
    right = ["dup", "mid", "dup"]
    reg = ConflictRegion(
        base_content="",
        left_content="x",
        right_content="dup",
        start_line=1,
        end_line=3,
        conflict_kind="added left",
    )
    assert conflict_region_to_head_span(reg, right) is None


def test_conflict_region_to_head_span_disambiguated():
    right = ["ctx", "dup", "tail"]
    reg = ConflictRegion(
        base_content="",
        left_content="ctx",
        right_content="dup",
        start_line=1,
        end_line=3,
        conflict_kind="added left",
    )
    assert conflict_region_to_head_span(reg, right) == (2, 2)


def test_conflict_region_to_head_span_sequential_duplicate_hunks():
    """Second identical right hunk resolves with prefer_after_line_0."""
    right = ["dup", "mid", "dup", "end"]
    first = ConflictRegion(
        base_content="",
        left_content="a",
        right_content="dup",
        start_line=1,
        end_line=2,
        conflict_kind="added left",
    )
    second = ConflictRegion(
        base_content="",
        left_content="mid",
        right_content="dup",
        start_line=3,
        end_line=4,
        conflict_kind="added left",
    )
    assert conflict_region_to_head_span(first, right) is None
    assert conflict_region_to_head_span(first, right, prefer_after_line_0=0) is None
    s1 = conflict_region_to_head_span(second, right, prefer_after_line_0=1)
    assert s1 == (3, 3)


def test_whole_head_file_equals_right_hunk():
    right = ["a", "b", "c"]
    reg = ConflictRegion(
        base_content="",
        left_content="old",
        right_content="a\nb\nc",
        start_line=1,
        end_line=9,
        conflict_kind="added right",
    )
    assert conflict_region_to_head_span(reg, right) == (1, 3)


def test_head_span_result_ambiguous_candidates():
    right = ["x", "dup", "y", "x", "dup", "y"]
    reg = ConflictRegion(
        base_content="",
        left_content="foo\nx",
        right_content="dup\ny",
        start_line=1,
        end_line=3,
        conflict_kind="added left",
    )
    r = conflict_region_to_head_span_result(reg, right)
    assert r["kind"] == "ambiguous"
    assert sorted(r["candidates"]) == [1, 4]
