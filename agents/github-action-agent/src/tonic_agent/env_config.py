"""Environment variable access with TONIC_AGENT_* names and optional legacy fallback keys."""

from __future__ import annotations

import os


def _get(name_tonic: str, name_rizzler: str | None = None) -> str | None:
    v = os.environ.get(name_tonic)
    if v is not None:
        return v
    if name_rizzler:
        return os.environ.get(name_rizzler)
    return None


def get_system_prompt_override() -> str | None:
    return _get("TONIC_AGENT_SYSTEM_PROMPT", "RIZZLER_SYSTEM_PROMPT")


def get_prompt_template_name() -> str | None:
    return _get("TONIC_AGENT_PROMPT_TEMPLATE", "RIZZLER_PROMPT_TEMPLATE")


def get_openai_api_key() -> str | None:
    return _get("TONIC_AGENT_OPENAI_API_KEY", "RIZZLER_OPENAI_API_KEY")


def get_openai_base_url() -> str | None:
    return _get("TONIC_AGENT_OPENAI_BASE_URL", "RIZZLER_OPENAI_BASE_URL")


def get_openai_model() -> str | None:
    return _get("TONIC_AGENT_OPENAI_MODEL", "RIZZLER_OPENAI_MODEL")


def get_timeout_seconds() -> int:
    raw = _get("TONIC_AGENT_TIMEOUT", "RIZZLER_TIMEOUT")
    if raw and raw.isdigit():
        return int(raw)
    return 60


def get_use_cache() -> bool:
    raw = _get("TONIC_AGENT_USE_CACHE", "RIZZLER_USE_CACHE")
    if raw is None:
        return True
    return raw.lower() in ("1", "true", "yes")


def get_cache_dir() -> str | None:
    return _get("TONIC_AGENT_CACHE_DIR", "RIZZLER_CACHE_DIR")


def get_cache_ttl_hours() -> int:
    raw = _get("TONIC_AGENT_CACHE_TTL_HOURS", "RIZZLER_CACHE_TTL_HOURS")
    if raw and raw.isdigit():
        return int(raw)
    return 24


def get_use_retries() -> bool:
    raw = _get("TONIC_AGENT_USE_RETRIES", "RIZZLER_USE_RETRIES")
    if raw is None:
        return True
    return raw.lower() in ("1", "true", "yes")


def get_fallback_order() -> str:
    return _get("TONIC_AGENT_FALLBACK_ORDER", "RIZZLER_FALLBACK_ORDER") or "openai"


def get_token_limit() -> int:
    raw = _get("TONIC_AGENT_TOKEN_LIMIT", "RIZZLER_TOKEN_LIMIT")
    if raw and raw.isdigit():
        return int(raw)
    return 8_192


def get_max_context_lines() -> int:
    raw = _get("TONIC_AGENT_MAX_CONTEXT_LINES", "RIZZLER_MAX_CONTEXT_LINES")
    if raw and raw.isdigit():
        return int(raw)
    return 100
