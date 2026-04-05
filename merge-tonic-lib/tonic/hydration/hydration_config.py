"""Hydration YAML/JSON config (parity with hydrationConfig.ts)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

QuestionRefinementMode = Literal["off", "improver", "subquestions"]
QuestionRefinementContext = Literal["minimal", "progressive"]


@dataclass
class ResolvedHydrationConfig:
    question_mode: QuestionRefinementMode
    refinement_context: QuestionRefinementContext
    strict_llm: bool
    llm_model: str
    llm_base_url: str
    openai_api_key_env: str
    llm_json_object: bool = True


def load_hydration_config_file(file_path: str | None) -> dict[str, Any]:
    if not (file_path or "").strip():
        return {}
    p = Path(file_path)
    raw = p.read_text(encoding="utf-8")
    if str(p).lower().endswith(".json"):
        return json.loads(raw)
    out: dict[str, Any] = {}
    for line in raw.splitlines():
        m = re.match(r"^(\w+):\s*(.*)$", line.strip())
        if not m:
            continue
        k, v = m.group(1), m.group(2).strip().strip("\"'")
        if k == "question_mode" and v in ("off", "improver", "subquestions"):
            out["question_mode"] = v
        elif k == "question_refinement_context" and v in ("minimal", "progressive"):
            out["question_refinement_context"] = v
        elif k == "strict_llm":
            out["strict_llm"] = v in ("true", "1", "yes")
        elif k == "llm_model":
            out["llm_model"] = v
        elif k == "llm_base_url":
            out["llm_base_url"] = v
        elif k == "openai_api_key_env":
            out["openai_api_key_env"] = v
        elif k == "llm_json_object":
            out["llm_json_object"] = v in ("true", "1", "yes")
    return out


def resolve_hydration_config(
    config_path: str | None,
    env: dict[str, str],
    *,
    question_mode_cli: QuestionRefinementMode | None = None,
    strict_llm: bool | None = None,
    llm_model: str | None = None,
    llm_base_url: str | None = None,
    openai_api_key_env: str | None = None,
) -> ResolvedHydrationConfig:
    base = ResolvedHydrationConfig(
        question_mode="off",
        refinement_context="minimal",
        strict_llm=False,
        llm_model="gpt-4o-mini",
        llm_base_url="https://api.openai.com/v1",
        openai_api_key_env="OPENAI_API_KEY",
        llm_json_object=True,
    )
    file_cfg = load_hydration_config_file(config_path)
    qm: QuestionRefinementMode = base.question_mode
    if file_cfg.get("question_mode") in ("off", "improver", "subquestions"):
        qm = file_cfg["question_mode"]
    env_mode = (env.get("TONIC_QUESTION_MODE") or "").strip()
    if env_mode in ("off", "improver", "subquestions"):
        qm = env_mode  # type: ignore[assignment]
    if question_mode_cli is not None:
        qm = question_mode_cli

    rc: QuestionRefinementContext = (
        "progressive" if file_cfg.get("question_refinement_context") == "progressive" else base.refinement_context
    )

    sl = base.strict_llm
    if "strict_llm" in file_cfg:
        sl = bool(file_cfg["strict_llm"])
    if strict_llm is not None:
        sl = strict_llm

    jo = base.llm_json_object
    if "llm_json_object" in file_cfg:
        jo = bool(file_cfg["llm_json_object"])
    env_jo = (env.get("TONIC_LLM_JSON_OBJECT") or "").strip().lower()
    if env_jo in ("0", "false", "no", "off"):
        jo = False
    if env_jo in ("1", "true", "yes", "on"):
        jo = True

    return ResolvedHydrationConfig(
        question_mode=qm,
        refinement_context=rc,
        strict_llm=sl,
        llm_model=(llm_model or file_cfg.get("llm_model") or base.llm_model).strip() or base.llm_model,
        llm_base_url=(llm_base_url or file_cfg.get("llm_base_url") or base.llm_base_url).strip()
        or base.llm_base_url,
        openai_api_key_env=(
            openai_api_key_env or file_cfg.get("openai_api_key_env") or base.openai_api_key_env
        ).strip()
        or base.openai_api_key_env,
        llm_json_object=jo,
    )
