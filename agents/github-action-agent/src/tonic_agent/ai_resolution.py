"""Compose cache + retry + OpenAI-compatible provider."""

from __future__ import annotations

from typing import Any

from . import env_config
from .caching_provider import CachingAIProvider
from .cache import AIResponseCacheFacade
from .providers.openai import OpenAICompatibleProvider
from .retry import RetryableProvider


def build_openai_stack() -> Any:
    """Return a provider with optional retry + disk cache (outermost first for callers)."""
    inner = OpenAICompatibleProvider()
    wrapped: Any = inner
    if env_config.get_use_retries():
        wrapped = RetryableProvider(wrapped)
    cache = AIResponseCacheFacade.from_env()
    return CachingAIProvider(wrapped, cache)
