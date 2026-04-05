"""Retry wrapper for AI providers (TONIC_AGENT_* env tuning)."""

from __future__ import annotations

import os
import random
import time
from dataclasses import dataclass

from .ai_provider import AIProvider, AIProviderConfig, AIResponse
from .models import ConflictFile, ConflictRegion


def _env_u32(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw and raw.isdigit():
        return int(raw)
    return default


def _env_f(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw:
        try:
            return float(raw)
        except ValueError:
            pass
    return default


@dataclass
class RetryConfig:
    max_retries: int
    initial_backoff_ms: int
    max_backoff_ms: int
    backoff_multiplier: float
    jitter_factor: float

    @classmethod
    def from_env(cls) -> RetryConfig:
        return cls(
            max_retries=_env_u32("TONIC_AGENT_MAX_RETRIES", 3),
            initial_backoff_ms=_env_u32("TONIC_AGENT_INITIAL_BACKOFF_MS", 1000),
            max_backoff_ms=_env_u32("TONIC_AGENT_MAX_BACKOFF_MS", 30000),
            backoff_multiplier=_env_f("TONIC_AGENT_BACKOFF_MULTIPLIER", 2.0),
            jitter_factor=_env_f("TONIC_AGENT_JITTER_FACTOR", 0.1),
        )

    def calculate_backoff_time(self, retry_attempt: int) -> float:
        base = self.initial_backoff_ms * (self.backoff_multiplier**retry_attempt)
        capped = min(base, float(self.max_backoff_ms))
        jitter_range = capped * self.jitter_factor
        jitter = random.random() * jitter_range * 2.0 - jitter_range
        return max(0.0, (capped + jitter) / 1000.0)

    def is_retryable_message(self, msg: str) -> bool:
        lower = msg.lower()
        return any(
            x in lower
            for x in (
                "connection",
                "timeout",
                "rate",
                "429",
                "503",
                "502",
                "request",
            )
        )


class RetryableProvider:
    def __init__(self, provider: AIProvider, config: RetryConfig | None = None) -> None:
        self._inner = provider
        self._config = config or RetryConfig.from_env()

    @property
    def inner(self) -> AIProvider:
        return self._inner

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
        *,
        hydration_appendix: str = "",
    ) -> AIResponse:
        last_err: Exception | None = None
        for attempt in range(self._config.max_retries + 1):
            try:
                return self._inner.resolve_conflict(
                    conflict_file, conflict, hydration_appendix=hydration_appendix
                )
            except Exception as e:
                last_err = e
                msg = str(e)
                if attempt >= self._config.max_retries or not self._config.is_retryable_message(
                    msg
                ):
                    raise
                time.sleep(self._config.calculate_backoff_time(attempt))
        assert last_err is not None
        raise last_err

    def resolve_file(self, conflict_file: ConflictFile) -> AIResponse:
        last_err: Exception | None = None
        for attempt in range(self._config.max_retries + 1):
            try:
                return self._inner.resolve_file(conflict_file)
            except Exception as e:
                last_err = e
                msg = str(e)
                if attempt >= self._config.max_retries or not self._config.is_retryable_message(
                    msg
                ):
                    raise
                time.sleep(self._config.calculate_backoff_time(attempt))
        assert last_err is not None
        raise last_err
