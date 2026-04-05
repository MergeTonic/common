"""Disk cache for AI responses keyed by prompt hash (TONIC_AGENT_CACHE_*)."""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

from . import env_config
from .ai_provider import AIResponse, TokenUsage
from .models import ConflictFile, ConflictRegion


def _hash_parts(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8", errors="replace"))
        h.update(b"\x1e")
    return h.hexdigest()


def _response_to_json(r: AIResponse) -> dict[str, Any]:
    tu = r.token_usage
    return {
        "content": r.content,
        "model": r.model,
        "explanation": r.explanation,
        "token_usage": None
        if tu is None
        else {
            "input_tokens": tu.input_tokens,
            "output_tokens": tu.output_tokens,
            "total_tokens": tu.total_tokens,
        },
    }


def _json_to_response(d: dict[str, Any]) -> AIResponse:
    tu = d.get("token_usage")
    return AIResponse(
        content=d["content"],
        model=d["model"],
        explanation=d.get("explanation"),
        token_usage=None
        if not tu
        else TokenUsage(
            input_tokens=int(tu["input_tokens"]),
            output_tokens=int(tu["output_tokens"]),
            total_tokens=int(tu["total_tokens"]),
        ),
    )


def _expired(path: Path, ttl: float) -> bool:
    return time.time() - path.stat().st_mtime > ttl


class DiskAIResolutionCache:
    def __init__(self, cache_dir: Path, ttl_seconds: float) -> None:
        self.cache_dir = cache_dir
        self.ttl_seconds = ttl_seconds
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def save(self, key: str, r: AIResponse) -> None:
        path = self.cache_dir / f"{key}.json"
        payload = {"saved": time.time(), "response": _response_to_json(r)}
        path.write_text(json.dumps(payload), encoding="utf-8")

    def load(self, key: str) -> AIResponse | None:
        path = self.cache_dir / f"{key}.json"
        if not path.is_file():
            return None
        if _expired(path, self.ttl_seconds):
            path.unlink(missing_ok=True)
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            return _json_to_response(payload["response"])
        except (json.JSONDecodeError, KeyError, OSError):
            return None


class AIResponseCacheFacade:
    """High-level get/put with conflict/file keying."""

    def __init__(self, inner: DiskAIResolutionCache, enabled: bool) -> None:
        self._inner = inner
        self.enabled = enabled

    @classmethod
    def from_env(cls) -> AIResponseCacheFacade:
        enabled = env_config.get_use_cache()
        ttl = env_config.get_cache_ttl_hours() * 3600
        raw_dir = env_config.get_cache_dir()
        base = Path(raw_dir or os.path.join(os.getcwd(), ".tonic_agent_cache"))
        return cls(DiskAIResolutionCache(base, ttl), enabled)

    def get_conflict(
        self,
        model: str,
        conflict_file: ConflictFile,
        conflict: ConflictRegion,
        hydration_digest: str = "",
    ) -> AIResponse | None:
        if not self.enabled:
            return None
        key = _hash_parts(
            "conflict",
            model,
            conflict_file.path,
            str(conflict.start_line),
            str(conflict.end_line),
            conflict.left_content,
            conflict.right_content,
            hydration_digest,
        )
        return self._inner.load(key)

    def put_conflict(
        self,
        model: str,
        conflict_file: ConflictFile,
        conflict: ConflictRegion,
        r: AIResponse,
        hydration_digest: str = "",
    ) -> None:
        if not self.enabled:
            return
        key = _hash_parts(
            "conflict",
            model,
            conflict_file.path,
            str(conflict.start_line),
            str(conflict.end_line),
            conflict.left_content,
            conflict.right_content,
            hydration_digest,
        )
        self._inner.save(key, r)

    def get_file(self, model: str, conflict_file: ConflictFile) -> AIResponse | None:
        if not self.enabled:
            return None
        key = _hash_parts("file", model, conflict_file.path, conflict_file.content)
        return self._inner.load(key)

    def put_file(self, model: str, conflict_file: ConflictFile, r: AIResponse) -> None:
        if not self.enabled:
            return
        key = _hash_parts("file", model, conflict_file.path, conflict_file.content)
        self._inner.save(key, r)
