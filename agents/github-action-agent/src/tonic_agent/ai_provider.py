"""AI provider protocol and errors."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from .models import ConflictFile, ConflictRegion


class AIProviderError(Exception):
    def __init__(self, message: str, code: str = "unknown") -> None:
        super().__init__(message)
        self.code = code


@dataclass
class TokenUsage:
    input_tokens: int
    output_tokens: int
    total_tokens: int


@dataclass
class AIResponse:
    content: str
    model: str
    explanation: str | None = None
    token_usage: TokenUsage | None = None


@dataclass
class AIProviderConfig:
    name: str
    api_key: str
    model: str
    base_url: str | None = None
    org_id: str | None = None
    system_prompt: str | None = None
    timeout_seconds: int = 60
    additional_settings: dict[str, str] = field(default_factory=dict)


@runtime_checkable
class AIProvider(Protocol):
    def name(self) -> str: ...

    def is_available(self) -> bool: ...

    def config(self) -> AIProviderConfig: ...

    def resolve_conflict(
        self,
        conflict_file: ConflictFile,
        conflict: ConflictRegion,
        *,
        hydration_appendix: str = "",
    ) -> AIResponse: ...

    def resolve_file(self, conflict_file: ConflictFile) -> AIResponse: ...

    def create_system_prompt(self) -> str:
        cfg = self.config()
        if cfg.system_prompt:
            return cfg.system_prompt
        return (
            "You are an expert software developer helping to resolve Tonic merge conflicts."
        )
