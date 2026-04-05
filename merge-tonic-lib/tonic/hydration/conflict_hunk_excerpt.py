"""Bounded ours/theirs conflict text for LLM prompts (parity with conflictHunkExcerpt.ts)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from tonic.git_conflict_parser import parse_git_conflicts

CONFLICT_HUNK_MAX_LINES_PER_SIDE = 40
CONFLICT_HUNK_MAX_TOTAL_CHARS = 32000


def _truncate_lines(lines: list[str], max_lines: int) -> tuple[str, bool]:
    if len(lines) <= max_lines:
        return "\n".join(lines), False
    slice_ = lines[:max_lines]
    return "\n".join(slice_) + "\n[… truncated …]", True


def build_conflict_hunk_excerpts(
    repo_root: str,
    conflict_art: dict[str, Any],
    env: dict[str, str],
) -> dict[str, Any]:
    disabled = (env.get("TONIC_CONFLICT_EXCERPT") or "").strip() == "0"
    regions_in = list(conflict_art.get("conflict_regions") or [])
    if disabled or not regions_in:
        return {"schema": "tonic-conflict-hunk-excerpts", "version": "1", "regions": []}

    max_lines = max(
        1,
        int((env.get("TONIC_CONFLICT_EXCERPT_MAX_LINES_PER_SIDE") or "").strip() or "0") or CONFLICT_HUNK_MAX_LINES_PER_SIDE,
    )
    max_total = max(
        1024,
        int((env.get("TONIC_CONFLICT_EXCERPT_MAX_TOTAL_CHARS") or "").strip() or "0") or CONFLICT_HUNK_MAX_TOTAL_CHARS,
    )

    root = Path(repo_root)
    out_regions: list[dict[str, Any]] = []
    total_chars = 0

    for r in regions_in:
        if total_chars >= max_total:
            break
        rel = str(r.get("path") or "").replace("\\", "/")
        parts = [x for x in rel.split("/") if x]
        if not parts:
            continue
        abs_p = root.joinpath(*parts)
        try:
            text = abs_p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        blocks = parse_git_conflicts(text)
        start0 = int(r.get("start_line", 0)) - 1
        end0 = int(r.get("end_line", 0)) - 1
        matched = False
        for b in blocks:
            if b.start_line != start0 or b.end_line != end0:
                continue
            matched = True
            ours_lines = b.segments[0].lines if b.segments else []
            theirs_lines = b.segments[1].lines if len(b.segments) > 1 else []
            o_t, o_tr = _truncate_lines(ours_lines, max_lines)
            t_t, t_tr = _truncate_lines(theirs_lines, max_lines)
            row: dict[str, Any] = {
                "region_id": r.get("region_id"),
                "path": str(r.get("path") or "").replace("\\", "/"),
                "ours_excerpt": o_t,
                "theirs_excerpt": t_t,
                "truncated": o_tr or t_tr,
            }
            row_chars = len(row["ours_excerpt"]) + len(row["theirs_excerpt"]) + 64
            if total_chars + row_chars > max_total:
                row["ours_excerpt"] = row["ours_excerpt"][: max(0, max_total - total_chars - 200)] + "\n[… truncated …]"
                row["theirs_excerpt"] = ""
                row["truncated"] = True
            total_chars += len(row["ours_excerpt"]) + len(row["theirs_excerpt"]) + 64
            out_regions.append(row)
            break
        if not matched:
            out_regions.append(
                {
                    "region_id": r.get("region_id"),
                    "path": str(r.get("path") or "").replace("\\", "/"),
                    "ours_excerpt": "",
                    "theirs_excerpt": "",
                    "truncated": False,
                }
            )

    return {"schema": "tonic-conflict-hunk-excerpts", "version": "1", "regions": out_regions}


def conflict_hunk_excerpts_to_prompt_json(art: dict[str, Any]) -> str:
    return json.dumps(art.get("regions") or [], indent=2)


def merge_branch_hints_from_regions(regions: list[dict[str, Any]]) -> str:
    labels: list[str] = []
    for r in regions:
        ol = r.get("ours_label")
        tl = r.get("theirs_label")
        if ol:
            labels.append(f"ours={ol}")
        if tl:
            labels.append(f"theirs={tl}")
    if not labels:
        return ""
    return "; ".join(dict.fromkeys(labels))
