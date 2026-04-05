"""Extract contiguous weave row ranges and splice fragments into a target weave."""

from __future__ import annotations

from .state import deserialize_state, serialize_state
from .tree import state_to_tree


class WeaveExtractError(ValueError):
    """Invalid extract range or fragment does not form a coherent weave subtree."""


class WeaveSpliceError(ValueError):
    """Invalid splice index or resulting weave is structurally invalid."""


def validate_weave_rows(rows: list[list]) -> None:
    """Raise WeaveExtractError if rows do not form a valid tree (per state_to_tree)."""
    try:
        state_to_tree(rows)
    except (TypeError, IndexError) as e:
        raise WeaveExtractError(
            "weave rows are not a structurally valid fragment (parent/depth chain broken)"
        ) from e


def extract_weave_rows(
    raw_state: str,
    weave_start: int,
    weave_end: int,
    *,
    allow_empty: bool = False,
) -> str:
    """Contiguous half-open range ``[weave_start, weave_end)`` of rows.

    Depths are shifted so the minimum depth in the slice is ``0``. The fragment
    must remain a valid implicit tree (validated via ``state_to_tree``).
    """
    rows = deserialize_state(raw_state)
    if weave_start < 0 or weave_end > len(rows) or weave_start > weave_end:
        raise WeaveExtractError(
            f"invalid range [{weave_start}, {weave_end}) for {len(rows)} weave rows"
        )
    if weave_start == weave_end:
        if allow_empty:
            return ""
        raise WeaveExtractError("empty extract range (use allow_empty=True if intentional)")
    sub = rows[weave_start:weave_end]
    min_d = min(r[1] for r in sub)
    shifted = [[line, d - min_d, ar, c, list(p)] for line, d, ar, c, p in sub]
    validate_weave_rows(shifted)
    return serialize_state(shifted)


def splice_weave_rows(target_raw: str, fragment_raw: str, split_weave_index: int) -> str:
    """Insert ``fragment`` before weave row ``split_weave_index`` in ``target``.

    ``split_weave_index`` in ``[0, len(target_rows)]``. Fragment depths are shifted
    to align with the anchor row at ``split_weave_index - 1`` when present (sibling
    alignment); at start, ``-min_depth`` normalization only.

    See docs/weave-line-indices-and-lca.md.
    """
    target = deserialize_state(target_raw)
    fragment = deserialize_state(fragment_raw)
    if split_weave_index < 0 or split_weave_index > len(target):
        raise WeaveSpliceError(
            f"split_weave_index {split_weave_index} out of range for {len(target)} target rows"
        )
    if not fragment:
        return target_raw
    frag_min = min(r[1] for r in fragment)
    if split_weave_index == 0:
        depth_off = -frag_min
    else:
        anchor_d = target[split_weave_index - 1][1]
        depth_off = anchor_d - frag_min
    adjusted = [[line, d + depth_off, ar, c, list(p)] for line, d, ar, c, p in fragment]
    merged = target[:split_weave_index] + adjusted + target[split_weave_index:]
    try:
        validate_weave_rows(merged)
    except WeaveExtractError as e:
        raise WeaveSpliceError(str(e)) from e
    return serialize_state(merged)
