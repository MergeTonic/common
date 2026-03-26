"""Bridge tonic.core merge outputs to agent payloads."""

from __future__ import annotations

from tonic.merge_utils import merge_snapshots as _merge_snapshots
from tonic.merge_utils import annotated_to_conflict_file as _annotated_to_cf

from .models import ConflictFile, ConflictRegion


def merge_snapshots(left_lines: list[str], right_lines: list[str]) -> tuple[list[str], list[str]]:
    """Merge two file snapshots using Tonic weave states (no shared history)."""
    return _merge_snapshots(left_lines, right_lines)


def annotated_to_conflict_file(path: str, annotated_lines: list[str]) -> ConflictFile:
    """Produce ConflictFile regions; each `<<<<<<< begin` … `>>>>>>> end` block becomes one region."""
    raw = _annotated_to_cf(path, annotated_lines)
    conflicts = [
        ConflictRegion(
            base_content=c.base_content,
            left_content=c.left_content,
            right_content=c.right_content,
            start_line=c.start_line,
            end_line=c.end_line,
            conflict_kind=c.conflict_kind,
        )
        for c in raw.conflicts
    ]
    return ConflictFile(path=raw.path, conflicts=conflicts, content=raw.content)
