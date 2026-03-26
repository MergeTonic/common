"""Tests for heuristic + apply_tonic_resolutions (parity with @mergetonic/core)."""

from __future__ import annotations

from tonic.merge_utils import (
    annotated_to_conflict_file,
    apply_tonic_heuristic,
    apply_tonic_resolutions,
    ConflictRegion,
    heuristic_resolved_lines,
    merge_snapshots,
    suggestion_line_count_ok,
)


def test_heuristic_prefers_right() -> None:
    r = ConflictRegion(
        left_content="a",
        right_content="b",
        start_line=1,
        end_line=1,
        conflict_kind="added both",
    )
    assert heuristic_resolved_lines(r) == ["b"]


def test_heuristic_left_fallback() -> None:
    r = ConflictRegion(left_content="x\ny", right_content="", start_line=1, end_line=1, conflict_kind="x")
    assert heuristic_resolved_lines(r) == ["x", "y"]


def test_suggestion_line_count_ok() -> None:
    assert suggestion_line_count_ok(["a"], 1) is True
    assert suggestion_line_count_ok(["a", "b"], 1) is False


def test_apply_tonic_resolutions_single() -> None:
    ann = [
        "before",
        "<<<<<<< begin added both",
        "L",
        "======= begin added both",
        "R",
        ">>>>>>> end conflict",
        "after",
    ]
    out = apply_tonic_resolutions(ann, [["Z"]])
    assert out == ["before", "Z", "after"]


def test_apply_tonic_resolutions_two_regions() -> None:
    ann = [
        "<<<<<<< begin added both",
        "a",
        "======= begin added both",
        "b",
        ">>>>>>> end conflict",
        "mid",
        "<<<<<<< begin added both",
        "c",
        "======= begin added both",
        "d",
        ">>>>>>> end conflict",
    ]
    cf = annotated_to_conflict_file("_", ann)
    assert len(cf.conflicts) == 2
    out = apply_tonic_resolutions(ann, [["1"], ["2"]])
    assert out == ["1", "mid", "2"]


def test_apply_tonic_heuristic_from_merge() -> None:
    left = ["line"]
    right = ["other"]
    _, ann = merge_snapshots(left, right)
    clean = apply_tonic_heuristic(ann)
    assert clean
    assert not any(ln.startswith("<<<<<<<") for ln in clean)
