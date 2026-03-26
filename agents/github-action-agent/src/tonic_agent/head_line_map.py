"""Map Tonic ConflictRegion to 1-based line numbers in the head (right) file for review comments.

When ``right_content`` appears multiple times in ``right_lines``, mapping may be
``ambiguous`` (multiple candidate start indices) or ``unmapped``.
Callers can pass ``prefer_after_line_0`` (0-based index of the first line *after*
the previous mapped region) so the matcher prefers occurrences later in the file.
"""

from __future__ import annotations

from typing import Literal, TypedDict

from .models import ConflictRegion


class _Unique(TypedDict):
    kind: Literal["unique"]
    span: tuple[int, int]


class _Ambiguous(TypedDict):
    kind: Literal["ambiguous"]
    candidates: list[int]


class _Unmapped(TypedDict):
    kind: Literal["unmapped"]


HeadSpanResult = _Unique | _Ambiguous | _Unmapped


def find_sublist_starts(haystack: list[str], needle: list[str]) -> list[int]:
    if not needle or len(needle) > len(haystack):
        return []
    out: list[int] = []
    for i in range(len(haystack) - len(needle) + 1):
        if haystack[i : i + len(needle)] == needle:
            out.append(i)
    return out


def find_sublist_start(haystack: list[str], needle: list[str]) -> int | None:
    starts = find_sublist_starts(haystack, needle)
    return starts[0] if starts else None


def _lines_equal(a: list[str], b: list[str]) -> bool:
    return len(a) == len(b) and all(x == y for x, y in zip(a, b, strict=True))


def _refine_matches_with_left_context(
    matches: list[int], right_lines: list[str], region: ConflictRegion
) -> list[int]:
    if len(matches) <= 1:
        return matches
    lc = (region.left_content or "").splitlines()
    if not lc:
        return []
    last_l = lc[-1]
    return [m for m in matches if m > 0 and right_lines[m - 1] == last_l]


def _disambiguate_by_position(
    matches: list[int],
    prefer_after_line_0: int | None,
) -> list[int]:
    if len(matches) <= 1 or prefer_after_line_0 is None:
        return matches
    forward = [m for m in matches if m >= prefer_after_line_0]
    return forward if forward else matches


def conflict_region_to_head_span_result(
    region: ConflictRegion,
    right_lines: list[str],
    *,
    prefer_after_line_0: int | None = None,
) -> HeadSpanResult:
    """Structured outcome: unique span, ambiguous candidate starts (0-based), or unmapped."""
    if not right_lines:
        return {"kind": "unmapped"}

    rc = region.right_content.splitlines() if region.right_content else []

    if rc:
        if len(rc) == len(right_lines) and _lines_equal(rc, right_lines):
            return {"kind": "unique", "span": (1, len(right_lines))}

        matches = find_sublist_starts(right_lines, rc)
        if len(matches) > 1:
            matches = _refine_matches_with_left_context(matches, right_lines, region)
        matches = _disambiguate_by_position(matches, prefer_after_line_0)
        if len(matches) > 1:
            if prefer_after_line_0 is not None:
                forward = [m for m in matches if m >= prefer_after_line_0]
                if len(forward) == 1:
                    i0 = forward[0]
                    return {"kind": "unique", "span": (i0 + 1, i0 + len(rc))}
            return {"kind": "ambiguous", "candidates": list(matches)}
        if len(matches) != 1:
            return {"kind": "unmapped"}
        i0 = matches[0]
        return {"kind": "unique", "span": (i0 + 1, i0 + len(rc))}

    lc_all = region.left_content.splitlines() if region.left_content else []
    if not lc_all:
        return {"kind": "unmapped"}

    if len(lc_all) == len(right_lines) and _lines_equal(lc_all, right_lines):
        return {"kind": "unique", "span": (1, len(right_lines))}

    matches = find_sublist_starts(right_lines, lc_all)
    if len(matches) > 1:
        matches = _refine_matches_with_left_context(matches, right_lines, region)
    matches = _disambiguate_by_position(matches, prefer_after_line_0)
    if len(matches) > 1:
        if prefer_after_line_0 is not None:
            forward = [m for m in matches if m >= prefer_after_line_0]
            if len(forward) == 1:
                i0 = forward[0]
                return {"kind": "unique", "span": (i0 + 1, i0 + len(lc_all))}
        if len(lc_all) == 1:
            return {"kind": "ambiguous", "candidates": list(matches)}
        return {"kind": "ambiguous", "candidates": list(matches)}
    if len(matches) != 1:
        if len(lc_all) == 1:
            line = lc_all[0]
            indices = [i for i, x in enumerate(right_lines) if x == line]
            if len(indices) == 1:
                idx = indices[0]
                return {"kind": "unique", "span": (idx + 1, idx + 1)}
            if len(indices) > 1:
                return {"kind": "ambiguous", "candidates": indices}
            return {"kind": "unmapped"}
        return {"kind": "unmapped"}
    i0 = matches[0]
    return {"kind": "unique", "span": (i0 + 1, i0 + len(lc_all))}


def conflict_region_to_head_span(
    region: ConflictRegion,
    right_lines: list[str],
    *,
    prefer_after_line_0: int | None = None,
) -> tuple[int, int] | None:
    """1-based inclusive (start_line, end_line) in the head file, or None if not uniquely mapped."""
    r = conflict_region_to_head_span_result(
        region, right_lines, prefer_after_line_0=prefer_after_line_0
    )
    if r["kind"] == "unique":
        return r["span"]
    return None


def conflict_region_to_head_line(region: ConflictRegion, right_lines: list[str]) -> int:
    """First 1-based line in head file to anchor an inline RIGHT-side review comment."""
    span = conflict_region_to_head_span(region, right_lines)
    if span is not None:
        return span[0]
    return 1
