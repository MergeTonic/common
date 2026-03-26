"""Unified diff + GitHub ```suggestion blocks for pull review comments."""

from __future__ import annotations

import difflib
import json
import re

from tonic.merge_utils import heuristic_resolved_lines as _heuristic_resolved_lines_core
from tonic.merge_utils import suggestion_line_count_ok as _suggestion_line_count_ok_core

from .models import ConflictRegion


def build_unified_diff(
    old_lines: list[str], new_lines: list[str], *, path: str = "file"
) -> str:
    """Minimal unified diff for markdown display."""
    a = [ln + "\n" for ln in old_lines]
    b = [ln + "\n" for ln in new_lines]
    return "".join(
        difflib.unified_diff(
            a,
            b,
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
            lineterm="\n",
        )
    ).strip()


def heuristic_resolved_lines(region: ConflictRegion) -> list[str]:
    """Prefer head (right) hunk; implementation in tonic.merge_utils."""
    return _heuristic_resolved_lines_core(region)


def suggestion_line_count_ok(resolved_lines: list[str], head_span_line_count: int) -> bool:
    return _suggestion_line_count_ok_core(resolved_lines, head_span_line_count)


def strip_json_fences(text: str) -> str:
    t = text.strip()
    m = re.match(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", t, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return t


def parse_resolved_lines_from_ai(content: str) -> tuple[list[str], str | None]:
    """
    Parse JSON {\"resolved_lines\": [...], \"rationale\": \"...\"} or plain line-based code.
    """
    raw = strip_json_fences(content.strip())
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            lines = data.get("resolved_lines")
            rat = data.get("rationale") if isinstance(data.get("rationale"), str) else None
            if isinstance(lines, list) and all(isinstance(x, str) for x in lines):
                return lines, rat
    except json.JSONDecodeError:
        pass
    if not raw:
        return [], None
    return raw.splitlines(), None


def build_github_suggestion_body(
    *,
    summary: str,
    explanation: str | None,
    unified_diff: str | None,
    suggestion_block: str | None,
    include_suggestion_fence: bool,
) -> str:
    """Assemble markdown: narrative, optional ```diff, optional ```suggestion."""
    parts: list[str] = [summary.rstrip()]
    if explanation:
        parts.extend(["", explanation.strip(), ""])
    if unified_diff:
        parts.extend(["**Diff (base → proposed):**", "", "```diff", unified_diff, "```", ""])
    if include_suggestion_fence and suggestion_block is not None:
        parts.extend(
            [
                "**Suggested change** (use *Commit suggestion* on GitHub):",
                "",
                "```suggestion",
                suggestion_block.rstrip("\n"),
                "```",
            ]
        )
    elif suggestion_block and not include_suggestion_fence:
        parts.extend(["", "_Suggestion omitted: line count does not match review span._", ""])
    return "\n".join(parts).rstrip() + "\n"
