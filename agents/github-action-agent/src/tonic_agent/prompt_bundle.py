"""Load shared conflict-AI prompt strings from vendored JSON.

The canonical conflict bundle stays synced from `agents/shared-tonic-ai-prompts/`.
Hydration prompt bundles live with their owning CLI packages and are loaded separately.
"""

from __future__ import annotations

import json
from importlib import resources
from typing import Any

_bundle: dict[str, Any] | None = None


def _load_bundle() -> dict[str, Any]:
    global _bundle
    if _bundle is None:
        raw = resources.files("tonic_agent.data").joinpath("ai_prompts.v1.json").read_text(encoding="utf-8")
        _bundle = json.loads(raw)
    return _bundle


def load_conflict_prompt_bundle() -> dict[str, Any]:
    return _load_bundle()


def github_json_response_suffix() -> str:
    return str(_load_bundle()["github_json_response_suffix"])


def system_prompt_body(template_key: str) -> str:
    key = template_key if template_key in ("default", "enhanced", "context_aware") else "enhanced"
    return str(_load_bundle()["system_prompts"][key])


def format_conflict_user(template_key: str, **kwargs: str) -> str:
    key = template_key if template_key in ("default", "enhanced", "context_aware") else "enhanced"
    tpl = str(_load_bundle()["conflict_user"][key])
    return tpl.format(**kwargs)


def format_file_user(template_key: str, **kwargs: str) -> str:
    key = template_key if template_key in ("default", "enhanced", "context_aware") else "enhanced"
    tpl = str(_load_bundle()["file_user"][key])
    return tpl.format(**kwargs)
