"""Map visible file lines to weave row indices and produce inspectable row metadata."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WeaveRowView:
    """One deserialized weave row for JSON / CLI inspect."""

    weave_index: int
    line: str
    depth: int
    anchored_right: bool
    count: int
    provenance: list[str]
    visible: bool
    visible_line: int | None  # 1-based when visible, else None


def row_tuple_to_view(
    weave_index: int,
    row: tuple[str, int, bool, int, list[str]],
    visible_line: int | None,
) -> WeaveRowView:
    line, depth, anchored_right, count, provenance = row
    return WeaveRowView(
        weave_index=weave_index,
        line=line,
        depth=depth,
        anchored_right=anchored_right,
        count=count,
        provenance=list(provenance),
        visible=bool(count % 2),
        visible_line=visible_line,
    )


def build_visible_weave_maps(
    rows: list[tuple[str, int, bool, int, list[str]]],
) -> tuple[list[WeaveRowView], list[int], dict[int, int]]:
    """Return (row_views, visible_to_weave, weave_to_visible).

    ``visible_to_weave[v-1]`` is the weave index for visible line ``v`` (1-based).
    ``weave_to_visible[i]`` is the 1-based visible line index, or -1 if tombstone.
    """
    views: list[WeaveRowView] = []
    visible_to_weave: list[int] = []
    weave_to_visible: dict[int, int] = {}
    visible_counter = 0
    for i, row in enumerate(rows):
        line, _depth, _ar, count, _p = row
        if count % 2:
            visible_counter += 1
            vl = visible_counter
            visible_to_weave.append(i)
            weave_to_visible[i] = vl
        else:
            vl = None
        views.append(row_tuple_to_view(i, row, vl))
    return views, visible_to_weave, weave_to_visible


def visible_line_count(rows: list[tuple[str, int, bool, int, list[str]]]) -> int:
    return sum(1 for r in rows if r[3] % 2)


class WeaveIntrospectError(ValueError):
    pass


def visible_range_to_weave_indices(
    rows: list[tuple[str, int, bool, int, list[str]]],
    start_visible: int,
    end_visible: int,
) -> list[int]:
    """Inclusive 1-based visible range → sorted weave indices (subset order).

    Raises WeaveIntrospectError if the range is empty or out of bounds.
    """
    n_vis = visible_line_count(rows)
    if start_visible < 1 or end_visible < start_visible or end_visible > n_vis:
        raise WeaveIntrospectError(
            f"visible range [{start_visible}, {end_visible}] invalid for {n_vis} visible lines"
        )
    _, visible_to_weave, _ = build_visible_weave_maps(rows)
    # visible line k maps to visible_to_weave[k-1]
    return list(visible_to_weave[start_visible - 1 : end_visible])


def split_weave_index_after_visible(
    rows: list[tuple[str, int, bool, int, list[str]]],
    after_visible: int,
) -> int:
    """Weave row index to pass to ``splice_weave_rows`` (insert *before* this index).

    ``after_visible=0`` → start of file. ``after_visible=n`` with ``n`` equal to the
    visible line count → append at end.
    """
    n_vis = visible_line_count(rows)
    if after_visible < 0 or after_visible > n_vis:
        raise WeaveIntrospectError(
            f"after_visible {after_visible} out of range for {n_vis} visible lines"
        )
    if after_visible == 0:
        return 0
    if after_visible == n_vis:
        return len(rows)
    visible_counter = 0
    for i, row in enumerate(rows):
        if row[3] % 2:
            visible_counter += 1
            if visible_counter == after_visible:
                return i + 1
    raise WeaveIntrospectError("internal: could not resolve after_visible")


def inspect_rows_json(rows: list[tuple[str, int, bool, int, list[str]]]) -> dict[str, Any]:
    views, visible_to_weave, weave_to_visible = build_visible_weave_maps(rows)
    return {
        "rows": [
            {
                "weave_index": v.weave_index,
                "line": v.line,
                "depth": v.depth,
                "anchored_right": v.anchored_right,
                "count": v.count,
                "provenance": v.provenance,
                "visible": v.visible,
                "visible_line": v.visible_line,
            }
            for v in views
        ],
        "visible_to_weave": list(visible_to_weave),
        "weave_to_visible": {str(k): v for k, v in sorted(weave_to_visible.items())},
    }
