"""Caching wrapper around an AIProvider."""

from __future__ import annotations

from .ai_provider import AIProvider, AIProviderConfig, AIResponse
from .cache import AIResponseCacheFacade
from .models import ConflictFile, ConflictRegion


class CachingAIProvider:
    def __init__(self, inner: AIProvider, cache: AIResponseCacheFacade) -> None:
        self._inner = inner
        self._cache = cache

    def name(self) -> str:
        return self._inner.name()

    def is_available(self) -> bool:
        return self._inner.is_available()

    def config(self) -> AIProviderConfig:
        return self._inner.config()

    def resolve_conflict(
        self,
        conflict_file: ConflictFile,
        conflict: ConflictRegion,
    ) -> AIResponse:
        model = self._inner.config().model
        hit = self._cache.get_conflict(model, conflict_file, conflict)
        if hit is not None:
            return hit
        r = self._inner.resolve_conflict(conflict_file, conflict)
        self._cache.put_conflict(model, conflict_file, conflict, r)
        return r

    def resolve_file(self, conflict_file: ConflictFile) -> AIResponse:
        model = self._inner.config().model
        hit = self._cache.get_file(model, conflict_file)
        if hit is not None:
            return hit
        r = self._inner.resolve_file(conflict_file)
        self._cache.put_file(model, conflict_file, r)
        return r
