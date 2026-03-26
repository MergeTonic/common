"""Token / line windowing helpers (TONIC_AGENT_TOKEN_LIMIT, MAX_CONTEXT_LINES)."""

from __future__ import annotations

from . import env_config


def estimate_tokens(text: str) -> int:
    return int((len(text) / 4.0) + 0.999)  # ceil without import


def needs_windowing(content: str) -> bool:
    limit = env_config.get_token_limit()
    return estimate_tokens(content) > limit


def max_context_lines() -> int:
    return env_config.get_max_context_lines()
