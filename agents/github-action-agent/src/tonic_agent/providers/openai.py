"""OpenAI-compatible chat completions (TONIC_AGENT_OPENAI_* env)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from .. import env_config
from ..ai_provider import AIProviderConfig, AIResponse, TokenUsage
from ..models import ConflictFile, ConflictRegion
from .. import prompt_bundle
from ..prompt_engineering import PromptGenerator, prompt_template_from_env


class OpenAICompatibleProvider:
    """HTTP client for OpenAI-compatible /v1/chat/completions."""

    def __init__(self) -> None:
        api_key = env_config.get_openai_api_key()
        if not api_key:
            raise ValueError(
                "Missing API key: set TONIC_AGENT_OPENAI_API_KEY"
            )
        base = env_config.get_openai_base_url() or "https://api.openai.com/v1"
        model = env_config.get_openai_model() or "gpt-4-turbo"
        timeout = env_config.get_timeout_seconds()
        system_prompt = env_config.get_system_prompt_override()
        self._config = AIProviderConfig(
            name="openai-compatible",
            api_key=api_key,
            model=model,
            base_url=base.rstrip("/"),
            org_id=None,
            system_prompt=system_prompt,
            timeout_seconds=timeout,
            additional_settings={},
        )
        self._prompt = PromptGenerator(prompt_template_from_env())

    def name(self) -> str:
        return self._config.name

    def is_available(self) -> bool:
        return bool(self._config.api_key)

    def config(self) -> AIProviderConfig:
        return self._config

    def _system_prompt(self) -> str:
        if self._config.system_prompt:
            return self._config.system_prompt
        return self._prompt.generate_system_prompt()

    def _post(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        url = f"{self._config.base_url}/chat/completions"
        body = json.dumps(
            {
                "model": self._config.model,
                "messages": messages,
                "temperature": 0.2,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._config.api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self._config.timeout_seconds) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"OpenAI HTTP {e.code}: {e.read().decode('utf-8', errors='replace')}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"OpenAI connection error: {e}") from e

    def _parse(self, data: dict[str, Any]) -> AIResponse:
        choices = data.get("choices") or []
        content = ""
        if choices:
            msg = (choices[0].get("message") or {})
            content = msg.get("content") or ""
        usage = data.get("usage") or {}
        tu = None
        if usage:
            tu = TokenUsage(
                input_tokens=int(usage.get("prompt_tokens") or 0),
                output_tokens=int(usage.get("completion_tokens") or 0),
                total_tokens=int(usage.get("total_tokens") or 0),
            )
        return AIResponse(
            content=content.strip(),
            model=str(data.get("model") or self._config.model),
            token_usage=tu,
        )

    def resolve_conflict(
        self,
        conflict_file: ConflictFile,
        conflict: ConflictRegion,
        *,
        hydration_appendix: str = "",
    ) -> AIResponse:
        user = self._prompt.generate_conflict_prompt(conflict_file, conflict)
        appendix = (hydration_appendix or "").strip()
        if appendix:
            user = f"{user}\n\n{appendix}"
        messages = [
            {"role": "system", "content": self._system_prompt() + prompt_bundle.github_json_response_suffix()},
            {"role": "user", "content": user},
        ]
        return self._parse(self._post(messages))

    def resolve_file(self, conflict_file: ConflictFile) -> AIResponse:
        user = self._prompt.generate_file_prompt(conflict_file)
        messages = [
            {"role": "system", "content": self._system_prompt() + prompt_bundle.github_json_response_suffix()},
            {"role": "user", "content": user},
        ]
        return self._parse(self._post(messages))
