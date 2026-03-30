"""Hydration LLM configuration resolved from environment variables."""

from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Mapping


HydrationLlmMode = str


@dataclass(frozen=True)
class HydrationLlmConfig:
    mode: HydrationLlmMode
    model: str
    base_url: str
    api_key: str
    timeout_ms: int


def _normalize_mode(raw: str | None) -> HydrationLlmMode:
    value = (raw or "deterministic").strip().lower()
    if value == "openai":
        return "openai"
    return "deterministic"


def resolve_hydration_llm_config(env: Mapping[str, str] | None = None) -> HydrationLlmConfig:
    source = env or os.environ
    timeout_raw = str(source.get("TONIC_HYDRATION_LLM_TIMEOUT_MS", "")).strip()
    try:
        timeout_ms = int(timeout_raw)
    except ValueError:
        timeout_ms = 0
    return HydrationLlmConfig(
        mode=_normalize_mode(source.get("TONIC_HYDRATION_LLM_MODE")),
        model=str(source.get("TONIC_HYDRATION_LLM_MODEL", "gpt-4o-mini")).strip(),
        base_url=str(source.get("TONIC_HYDRATION_LLM_BASE_URL", "https://api.openai.com/v1")).strip().rstrip("/"),
        api_key=str(source.get("TONIC_HYDRATION_LLM_API_KEY") or source.get("OPENAI_API_KEY") or "").strip(),
        timeout_ms=timeout_ms if timeout_ms > 0 else 30_000,
    )
