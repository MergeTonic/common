"""Ordered provider fallback chain."""

from __future__ import annotations

from typing import Callable

from .ai_provider import AIResponse
from .models import ConflictFile, ConflictRegion


def resolve_conflict_with_fallback(
    factories: list[Callable[[], object]],
    conflict_file: ConflictFile,
    conflict: ConflictRegion,
) -> tuple[AIResponse, str]:
    last_err: Exception | None = None
    for factory in factories:
        try:
            p = factory()
            if hasattr(p, "is_available") and not p.is_available():
                continue
            resolve = getattr(p, "resolve_conflict")
            return resolve(conflict_file, conflict), getattr(p, "name")()
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"All providers failed: {last_err}")


def resolve_file_with_fallback(
    factories: list[Callable[[], object]],
    conflict_file: ConflictFile,
) -> tuple[AIResponse, str]:
    last_err: Exception | None = None
    for factory in factories:
        try:
            p = factory()
            if hasattr(p, "is_available") and not p.is_available():
                continue
            resolve = getattr(p, "resolve_file")
            return resolve(conflict_file), getattr(p, "name")()
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"All providers failed: {last_err}")
