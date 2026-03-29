"""Apply PR author inputs to ConflictFile labels for AI prompts."""

from __future__ import annotations

import os
from dataclasses import replace

from .models import ConflictFile


def apply_pr_labels_to_conflict_file(cf: ConflictFile) -> ConflictFile:
    """Prefer INPUT_AUTHOR_ALIAS_*; else INPUT_GITHUB_LOGIN_*; else keep existing labels."""
    left = (os.environ.get("INPUT_AUTHOR_ALIAS_LEFT") or "").strip() or (
        os.environ.get("INPUT_GITHUB_LOGIN_LEFT") or ""
    ).strip()
    right = (os.environ.get("INPUT_AUTHOR_ALIAS_RIGHT") or "").strip() or (
        os.environ.get("INPUT_GITHUB_LOGIN_RIGHT") or ""
    ).strip()
    return replace(
        cf,
        left_label=left or cf.left_label,
        right_label=right or cf.right_label,
    )
