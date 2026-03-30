"""Load hydration prompt strings from package-local JSON assets."""

from __future__ import annotations

import json
from importlib import resources
import re
from typing import Any

_bundle: dict[str, Any] | None = None
_agentic_bundle: dict[str, Any] | None = None


def _resolve_hydration_prompt_profile(profile_name: str | None) -> dict[str, Any]:
    bundle = load_hydration_prompt_bundle()
    selected = (profile_name or "").strip() or "default"
    profiles = bundle.get("profiles")
    profile_data: dict[str, Any] = {}
    if isinstance(profiles, dict):
        raw_profile = profiles.get(selected)
        if selected != "default" and not isinstance(raw_profile, dict):
            available = ", ".join(sorted(str(key) for key in profiles.keys()))
            raise ValueError(
                f"Unknown hydration prompt profile '{selected}'. Available profiles: {available or 'default'}"
            )
        if isinstance(raw_profile, dict):
            profile_data = raw_profile
    question_generation = bundle.get("question_generation", {})
    synthesis = bundle.get("synthesis", {})
    question_override = profile_data.get("question_generation", {})
    synthesis_override = profile_data.get("synthesis", {})
    return {
        "schema_version": bundle.get("schema_version", 1),
        "question_generation": {
            "system": str(question_override.get("system", question_generation.get("system", ""))),
            "user": str(question_override.get("user", question_generation.get("user", ""))),
        },
        "retrieval_slot_user": str(profile_data.get("retrieval_slot_user", bundle.get("retrieval_slot_user", ""))),
        "synthesis": {
            "system": str(synthesis_override.get("system", synthesis.get("system", ""))),
            "user": str(synthesis_override.get("user", synthesis.get("user", ""))),
        },
    }


def load_hydration_prompt_bundle() -> dict[str, Any]:
    global _bundle
    if _bundle is None:
        raw = (
            resources.files("tonic.hydration")
            .joinpath("prompts/hydration_prompts.v1.json")
            .read_text(encoding="utf-8")
        )
        _bundle = json.loads(raw)
    return _bundle


def load_agentic_prompt_bundle() -> dict[str, Any]:
    global _agentic_bundle
    if _agentic_bundle is None:
        raw = (
            resources.files("tonic.hydration")
            .joinpath("prompts/agentic_prompts.v1.json")
            .read_text(encoding="utf-8")
        )
        _agentic_bundle = json.loads(raw)
    return _agentic_bundle


def format_hydration_prompt_template(template: str, **kwargs: str) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key in kwargs and kwargs[key] is not None:
            return str(kwargs[key])
        return f"{{{key}}}"

    return re.sub(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", replace, template)


def format_agentic_prompt_template(template: str, **kwargs: str) -> str:
    return format_hydration_prompt_template(template, **kwargs)


def question_generation_system_prompt(prompt_profile: str = "") -> str:
    return str(_resolve_hydration_prompt_profile(prompt_profile)["question_generation"]["system"])


def question_generation_user_prompt(**kwargs: str) -> str:
    tpl = str(_resolve_hydration_prompt_profile(kwargs.get("prompt_profile"))["question_generation"]["user"])
    values = {
        "repo_root": kwargs.get("repo_root", ""),
        "scope": kwargs.get("scope", ""),
        "downstream_task": kwargs.get("downstream_task", ""),
        "branch_intents": kwargs.get("branch_intents", "(none)"),
        "hydrated_context": kwargs.get("hydrated_context", "(none)"),
        "max_questions": kwargs.get("max_questions", "1"),
        "prior_questions": kwargs.get("prior_questions", "(none)"),
    }
    return format_hydration_prompt_template(tpl, **values)


def retrieval_slot_user_prompt(**kwargs: str) -> str:
    tpl = str(_resolve_hydration_prompt_profile(kwargs.get("prompt_profile"))["retrieval_slot_user"])
    return format_hydration_prompt_template(tpl, **kwargs)


def synthesis_system_prompt(prompt_profile: str = "") -> str:
    return str(_resolve_hydration_prompt_profile(prompt_profile)["synthesis"]["system"])


def synthesis_user_prompt(**kwargs: str) -> str:
    tpl = str(_resolve_hydration_prompt_profile(kwargs.get("prompt_profile"))["synthesis"]["user"])
    return format_hydration_prompt_template(tpl, **kwargs)


def agentic_prompt_section(section: str) -> dict[str, str]:
    bundle = load_agentic_prompt_bundle()
    data = bundle.get(section, {})
    if not isinstance(data, dict):
        return {}
    return {str(key): str(value) for key, value in data.items()}


def _render_plan(plan: list[dict[str, object]]) -> str:
    return "\n".join(
        f"{str(step.get('id', ''))}: {str(step.get('title', ''))}"
        for step in plan
    )


def _render_current_step(step: dict[str, object] | None) -> str:
    if not step:
        return ""
    step_id = str(step.get("id", ""))
    title = str(step.get("title", ""))
    description = str(step.get("description", "")).strip()
    if description:
        return f"The current step:\n{step_id}: {title}\n{description}\n"
    return f"The current step:\n{step_id}: {title}\n"


def _render_base_history(history: list[dict[str, object]]) -> str:
    parts: list[str] = []
    for entry in history:
        parts.append(f"Step {entry.get('stepId', '')}\n{entry.get('summary', '')}")
    return "\n\n".join(parts)


def _render_code_search_history(history: list[dict[str, object]]) -> str:
    items: list[str] = []
    for entry in history:
        parts = [f"Step {entry.get('stepId', '')}", str(entry.get("summary", ""))]
        chunks = entry.get("chunks")
        if isinstance(chunks, list) and chunks:
            chunk_lines: list[str] = []
            for chunk in chunks:
                if not isinstance(chunk, dict):
                    continue
                file_path = str(chunk.get("filePath", ""))
                symbol = str(chunk.get("symbol", "")).strip()
                snippet = str(chunk.get("snippet", ""))
                suffix = f" ({symbol})" if symbol else ""
                chunk_lines.append(f"  - {file_path}{suffix}\n    {snippet}")
            if chunk_lines:
                parts.append("Relevant code:\n" + "\n".join(chunk_lines))
        insights = entry.get("insights")
        if isinstance(insights, list) and insights:
            parts.append("Insights: " + "; ".join(str(value) for value in insights))
        items.append("\n".join(parts))
    return "\n\n".join(items)


def _render_bcp_history(history: list[dict[str, object]]) -> str:
    items: list[str] = []
    for entry in history:
        parts = [f"Step {entry.get('stepId', '')}", str(entry.get("summary", ""))]
        evidence = entry.get("evidence")
        if isinstance(evidence, list) and evidence:
            parts.append("Evidence: " + ", ".join(str(value) for value in evidence))
        candidates = entry.get("candidateAnswers")
        if isinstance(candidates, list) and candidates:
            parts.append("Candidate answers: " + ", ".join(str(value) for value in candidates))
        elif isinstance(candidates, str) and candidates.strip():
            parts.append("Candidate answers: " + candidates.strip())
        items.append("\n".join(parts))
    return "\n\n".join(items)


def _format_agentic_execute_step_user(
    *,
    section_name: str,
    context: dict[str, object],
    step: dict[str, object] | None,
    query_override: str | None,
    history_text: str,
) -> str:
    section = agentic_prompt_section(section_name)
    template = section.get(
        "execute_step_user",
        "The original user query: {query}\n\nThe query plan:\n{plan}\n{current_step}\n{history}",
    )
    history = f"What we discovered so far:\n{history_text}" if history_text else ""
    return format_agentic_prompt_template(
        template,
        query=query_override or str(context.get("query", "")),
        plan=_render_plan(list(context.get("plan", [])) if isinstance(context.get("plan"), list) else []),
        current_step=_render_current_step(step),
        history=history,
    )


def build_base_execute_step_user_prompt(
    *,
    context: dict[str, object],
    step: dict[str, object] | None = None,
    query_override: str | None = None,
) -> str:
    history = _render_base_history(
        list(context.get("history", [])) if isinstance(context.get("history"), list) else []
    )
    return _format_agentic_execute_step_user(
        section_name="base",
        context=context,
        step=step,
        query_override=query_override,
        history_text=history,
    )


def build_code_search_execute_step_user_prompt(
    *,
    context: dict[str, object],
    step: dict[str, object] | None = None,
    query_override: str | None = None,
) -> str:
    history = _render_code_search_history(
        list(context.get("history", [])) if isinstance(context.get("history"), list) else []
    )
    return _format_agentic_execute_step_user(
        section_name="code_search",
        context=context,
        step=step,
        query_override=query_override,
        history_text=history,
    )


def build_bcp_execute_step_user_prompt(
    *,
    context: dict[str, object],
    step: dict[str, object] | None = None,
    query_override: str | None = None,
) -> str:
    history = _render_bcp_history(
        list(context.get("history", [])) if isinstance(context.get("history"), list) else []
    )
    return _format_agentic_execute_step_user(
        section_name="bcp_search",
        context=context,
        step=step,
        query_override=query_override,
        history_text=history,
    )
