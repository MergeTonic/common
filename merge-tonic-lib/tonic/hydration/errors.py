"""Hydration runtime error types."""

from __future__ import annotations


class HydrationRuntimeError(RuntimeError):
    """Base runtime error for hydration substrate failures."""


class OptionalAiDependencyError(HydrationRuntimeError):
    """Raised when an optional AI dependency is required but not installed."""


class HydrationPersistError(HydrationRuntimeError):
    """Raised when the persisted Chroma tree is unsafe to reuse."""
