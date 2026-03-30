"""Optional provider-backed structured LLM service for hydration flows."""

from __future__ import annotations

import json
from typing import Any, Protocol, TypeVar
from urllib import error, request

from .errors import HydrationRuntimeError
from .llm_config import HydrationLlmConfig, resolve_hydration_llm_config


HydrationLlmRole = str


class HydrationLlmMessage(dict[str, str]):
    pass


T = TypeVar("T")


class HydrationLlmService(Protocol):
    provider_id: str
    model: str

    def generate_json(
        self,
        *,
        messages: list[HydrationLlmMessage],
        schema_name: str,
        schema_description: str,
    ) -> T:
        ...


def _extract_json_object(text: str) -> str:
    trimmed = text.strip()
    if trimmed.startswith("{") and trimmed.endswith("}"):
        return trimmed
    start = trimmed.find("{")
    end = trimmed.rfind("}")
    if start >= 0 and end > start:
        return trimmed[start : end + 1]
    raise HydrationRuntimeError("LLM response did not contain a JSON object.")


class OpenAiHydrationLlmService:
    provider_id = "openai"

    def __init__(self, config: HydrationLlmConfig) -> None:
        if not config.api_key:
            raise HydrationRuntimeError(
                "TONIC_HYDRATION_LLM_MODE=openai requires TONIC_HYDRATION_LLM_API_KEY or OPENAI_API_KEY."
            )
        self._config = config
        self.model = config.model

    def generate_json(
        self,
        *,
        messages: list[HydrationLlmMessage],
        schema_name: str,
        schema_description: str,
    ) -> Any:
        payload = {
            "model": self._config.model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                *messages,
                {
                    "role": "system",
                    "content": (
                        f"Return only a JSON object for schema '{schema_name}'. "
                        f"Required shape: {schema_description}"
                    ),
                },
            ],
        }
        req = request.Request(
            f"{self._config.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._config.api_key}",
            },
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=self._config.timeout_ms / 1000.0) as resp:
                text = resp.read().decode("utf-8", errors="replace")
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise HydrationRuntimeError(f"OpenAI HTTP {exc.code}: {body}") from exc
        except OSError as exc:
            raise HydrationRuntimeError(
                f"Failed to generate structured hydration output via {self.provider_id}: {exc}"
            ) from exc

        try:
            parsed = json.loads(text)
            content = (((parsed.get("choices") or [{}])[0] or {}).get("message") or {}).get("content")
            output = (
                content
                if isinstance(content, str)
                else "".join(
                    str(entry.get("text", ""))
                    for entry in content
                    if isinstance(entry, dict)
                )
                if isinstance(content, list)
                else ""
            )
            return json.loads(_extract_json_object(output))
        except (ValueError, TypeError) as exc:
            raise HydrationRuntimeError(
                f"Failed to generate structured hydration output via {self.provider_id}: {exc}"
            ) from exc


def create_hydration_llm_service(env: dict[str, str] | None = None) -> HydrationLlmService | None:
    config = resolve_hydration_llm_config(env)
    if config.mode == "deterministic":
        return None
    return OpenAiHydrationLlmService(config)
