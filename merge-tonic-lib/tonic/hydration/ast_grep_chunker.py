"""Ast-grep match spans → text chunks (parity with @mergetonic/coding-hydration)."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any


def _line_range(m: dict[str, Any]) -> tuple[int, int]:
    start = m.get("start") or {}
    end = m.get("end") or {}
    lo = int(start.get("line", 1)) if isinstance(start, dict) else 1
    hi = int(end.get("line", lo)) if isinstance(end, dict) else lo
    return lo, max(lo, hi)


def _merge_ranges(ranges: list[tuple[int, int]], max_span: int = 120) -> list[tuple[int, int]]:
    if not ranges:
        return []
    sorted_r = sorted(ranges, key=lambda x: (x[0], x[1]))
    out: list[tuple[int, int]] = []
    cur_lo, cur_hi = sorted_r[0]
    for lo, hi in sorted_r[1:]:
        if lo <= cur_hi + 1:
            cur_hi = max(cur_hi, hi)
        else:
            out.append((cur_lo, cur_hi))
            cur_lo, cur_hi = lo, hi
    out.append((cur_lo, cur_hi))
    merged: list[tuple[int, int]] = []
    for lo, hi in out:
        span = hi - lo + 1
        if span > max_span:
            merged.append((lo, lo + max_span - 1))
        else:
            merged.append((lo, hi))
    return merged


def chunk_file_ast_grep(repo_root: str, rel_path: str, matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rel = rel_path.replace("\\", "/")
    file_matches = [m for m in matches if str(m.get("path", "")).replace("\\", "/") == rel]
    if not file_matches:
        return []
    abs_path = Path(repo_root) / rel
    try:
        raw = abs_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    lines = raw.splitlines()
    merged = _merge_ranges([_line_range(m) for m in file_matches])
    out: list[dict[str, Any]] = []
    for idx, (start_line, end_line) in enumerate(merged, start=1):
        slice_lines = lines[start_line - 1 : end_line]
        text = "\n".join(slice_lines)
        first = next(
            (m for m in file_matches if _line_range(m)[0] <= end_line and _line_range(m)[1] >= start_line),
            None,
        )
        meta = first.get("meta") if isinstance(first, dict) else None
        sym = meta.get("name") if isinstance(meta, dict) and isinstance(meta.get("name"), str) else None
        rule_id = str(first.get("rule_id", "")) if first else ""
        out.append(
            {
                "path": rel,
                "start_line": start_line,
                "end_line": end_line,
                "text": text,
                "ast_rule_id": rule_id or None,
                "ast_match_id": f"{rel}:{start_line}-{end_line}:{idx}",
                "symbol": sym,
            }
        )
    return out


def chunks_from_ast_artifact(repo_root: str, matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_path: dict[str, list[dict[str, Any]]] = {}
    for m in matches:
        if not isinstance(m, dict):
            continue
        p = str(m.get("path", "")).replace("\\", "/")
        by_path.setdefault(p, []).append(m)
    chunks: list[dict[str, Any]] = []
    for rel in sorted(by_path.keys()):
        chunks.extend(chunk_file_ast_grep(repo_root, rel, by_path[rel]))
    return chunks
