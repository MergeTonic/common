"""Parse Tonic annotated conflict markers (parity with @mergetonic/core conflictParser)."""

from __future__ import annotations

import re

BEGIN = re.compile(r"^<<<<<<< begin (.+)$")
MID = re.compile(r"^======= begin (.+)$")
END = re.compile(r"^>>>>>>> end conflict$")


def parse_conflict_label(raw_label: str) -> dict:
    raw = raw_label.strip()
    if not raw:
        return {"raw": "", "base_kind": "", "tags": {}}
    parts = [p.strip() for p in raw.split("|") if p.strip()]
    if not parts:
        return {"raw": raw, "base_kind": raw, "tags": {}}
    tags: dict[str, str] = {}
    for part in parts[1:]:
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        key = key.strip()
        if not key:
            continue
        tags[key] = value.strip()
    return {"raw": raw, "base_kind": parts[0], "tags": tags}


def parse_tonic_conflicts(text: str) -> list[dict]:
    """Return blocks with 0-based start_line/end_line inclusive, kind, segments."""
    diag = parse_tonic_conflicts_with_diagnostics(text)
    return diag["blocks"]


def parse_tonic_conflicts_with_diagnostics(text: str) -> dict:
    lines = text.splitlines()
    blocks: list[dict] = []
    warnings: list[str] = []
    i = 0
    while i < len(lines):
        bm = BEGIN.match(lines[i])
        if not bm:
            i += 1
            continue
        start_line = i
        kind = bm.group(1).strip()
        kind_metadata = parse_conflict_label(kind)
        i += 1
        segments: list[dict] = []
        current_label = kind
        current: list[str] = []
        closed = False
        while i < len(lines):
            line = lines[i]
            if END.match(line):
                segments.append(
                    {
                        "label": current_label,
                        "lines": current,
                        "metadata": parse_conflict_label(current_label),
                    }
                )
                blocks.append(
                    {
                        "start_line": start_line,
                        "end_line": i,
                        "kind": kind,
                        "base_kind": kind_metadata["base_kind"],
                        "tags": dict(kind_metadata["tags"]),
                        "segments": segments,
                    }
                )
                i += 1
                closed = True
                break
            mm = MID.match(line)
            if mm:
                segments.append(
                    {
                        "label": current_label,
                        "lines": current,
                        "metadata": parse_conflict_label(current_label),
                    }
                )
                current_label = mm.group(1).strip()
                current = []
                i += 1
                continue
            current.append(line)
            i += 1
        if not closed:
            warnings.append(
                f'Unterminated Tonic conflict block (kind "{kind}") starting at line {start_line + 1}',
            )
    return {"blocks": blocks, "warnings": warnings}
