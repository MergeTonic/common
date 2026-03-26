"""Deterministic PR / review comment bodies with hidden idempotency markers."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from enum import Enum

from .comment_chunking import continuity_footer, markdown_code_fences, markdown_text_fences


class CommentMode(str, Enum):
    SUMMARY_ONLY = "summary-only"
    FILE_INLINE = "file+inline"
    INLINE_ONLY = "inline-only"
    ALL = "all"


class Verbosity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


def marker_summary(run_id: str) -> str:
    return f"<!-- tonic-agent:summary:{run_id} -->"


def summary_upsert_prefix() -> str:
    """Stable substring used to find an existing Tonic summary comment to update."""
    return "<!-- tonic-agent:summary"


def marker_file(path: str, content_hash: str) -> str:
    return f"<!-- tonic-agent:file:{path}:{content_hash} -->"


def file_upsert_prefix(path: str) -> str:
    return f"<!-- tonic-agent:file:{path}:"


def marker_inline(path: str, start: int, end: int, kind: str) -> str:
    return f"<!-- tonic-agent:inline:{path}:{start}:{end}:{kind} -->"


def marker_orphan(
    path: str, start: int, end: int, kind: str, reason: str
) -> str:
    return f"<!-- tonic-agent:orphan-inline:{path}:{start}:{end}:{kind}:{reason} -->"


def _digest(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8", errors="replace"))
        h.update(b"|")
    return h.hexdigest()[:16]


def build_summary_body(
    run_id: str,
    pr_title: str,
    files: list[dict],
    *,
    verbosity: Verbosity = Verbosity.MEDIUM,
) -> str:
    """PR-level summary comment (Markdown)."""
    lines = [
        marker_summary(run_id),
        "",
        "## Tonic merge report",
        "",
        f"**PR:** {pr_title}",
        "",
        "Per-file conflict summaries (Tonic markers) are listed below when present.",
        "",
    ]
    if verbosity != Verbosity.LOW:
        lines.append(
            markdown_code_fences(
                "json",
                "Per-file metadata",
                json.dumps({"files": files}, indent=2),
            )
        )
    else:
        lines.append(f"- **Files analyzed:** {len(files)}")
    lines.append("")
    return "\n".join(lines)


@dataclass
class FileReviewComment:
    path: str
    body: str
    line: int | None
    side: str | None


def build_file_top_comment(
    path: str,
    left_lines: list[str],
    right_lines: list[str],
    annotated: list[str],
    *,
    ai_note: str | None = None,
    marker_branch: str | None = None,
    merge_report_artifact: str | None = None,
) -> str:
    """Single issue comment for a file path (non-inline)."""
    digest = _digest(path, "\n".join(annotated))
    body = markdown_text_fences(
        "Tonic annotated merge output (left = base, right = head)",
        "\n".join(annotated),
    )
    lines = [
        marker_file(path, digest),
        "",
        f"### `{path}`",
        "",
        body,
        "",
        f"_Left lines: {len(left_lines)} · Right lines: {len(right_lines)}_",
        continuity_footer(
            marker_branch=marker_branch,
            merge_report_artifact=merge_report_artifact,
        ),
    ]
    if ai_note:
        lines.extend(
            [
                "",
                "---",
                "",
                "**AI suggestion (optional):**",
                "",
                markdown_text_fences("AI output", ai_note),
            ]
        )
    return "\n".join(lines)


def build_orphan_inline_thread_comment(
    path: str,
    start_line: int,
    end_line: int,
    conflict_kind: str,
    reason: str,
    snippet: str,
    *,
    extra_sections: str | None = None,
    marker_branch: str | None = None,
    merge_report_artifact: str | None = None,
) -> str:
    hint = (
        "Head line span is **ambiguous** (duplicate hunks). Anchored at line 1 for thread visibility."
        if reason == "ambiguous"
        else "Head line span is **unmapped** (empty side or no match). Anchored at line 1 for thread visibility."
    )
    fence = markdown_text_fences("Tonic markers for this region", snippet)
    lines = [
        marker_orphan(path, start_line, end_line, conflict_kind, reason),
        "",
        f"**Tonic orphan** `{conflict_kind}` (annotated output lines {start_line}–{end_line})",
        "",
        hint,
        "",
        fence,
        continuity_footer(
            marker_branch=marker_branch,
            merge_report_artifact=merge_report_artifact,
        ),
    ]
    if extra_sections:
        lines.extend(["", "---", "", extra_sections.rstrip(), ""])
    return "\n".join(lines).rstrip() + "\n"


def build_inline_thread_comment(
    path: str,
    start_line: int,
    end_line: int,
    conflict_kind: str,
    snippet: str,
    *,
    extra_sections: str | None = None,
    marker_branch: str | None = None,
    merge_report_artifact: str | None = None,
) -> str:
    """PR review inline comment on a diff line (body only)."""
    fence = markdown_text_fences(
        "Tonic markers and hunks for this region",
        snippet,
    )
    lines = [
        marker_inline(path, start_line, end_line, conflict_kind),
        "",
        f"**Tonic conflict** `{conflict_kind}` (annotated output lines {start_line}–{end_line})",
        "",
        fence,
        continuity_footer(
            marker_branch=marker_branch,
            merge_report_artifact=merge_report_artifact,
        ),
    ]
    if extra_sections:
        lines.extend(["", "---", "", extra_sections.rstrip(), ""])
    return "\n".join(lines).rstrip() + "\n"


def check_run_annotation_payload(
    path: str,
    message: str,
) -> dict:
    """JSON-serializable object for optional Checks API (annotations) — caller supplies conclusion."""
    return {
        "path": path,
        "annotation_level": "warning",
        "message": message[:500],
    }
