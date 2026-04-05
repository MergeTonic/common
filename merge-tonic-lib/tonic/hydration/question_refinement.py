"""Question refinement stage (parity with questionRefinement.ts)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from tonic.hydration.hydration_config import ResolvedHydrationConfig
from tonic.hydration.hydration_prompt_template import apply_hydration_template, load_hydration_prompt_body
from tonic.hydration.intent_bootstrap import digest_for_refinement_context
from tonic.hydration.llm_refinement import LlmChatParams, call_llm_json, parse_question_refinement_json

IMPROVER_SYSTEM_FALLBACK = (
    "You output only valid JSON with keys refined_left_intent, refined_right_intent, "
    "merge_goals (string array), assumptions (string array)."
)
SUBQ_SYSTEM_FALLBACK = (
    'You output only valid JSON with key subquestions: array of {id, text, priority (number)}.'
)
POST_RETRIEVAL_SYSTEM_FALLBACK = (
    "You output only valid JSON with keys refined_left_intent, refined_right_intent, "
    "merge_goals (string array), assumptions (string array), informed_by_retrieval (boolean optional)."
)


def run_question_refinement(
    *,
    mode: Literal["off", "improver", "subquestions"],
    config: ResolvedHydrationConfig,
    left_intent: str,
    right_intent: str,
    conflict_regions_json: str,
    repo_structure_excerpt: str,
    prior_phases_digest: str = "",
    prior_refinement_pass_label: str = "",
    user_query: str = "",
    follow_up: str = "",
    conflict_hunks_excerpt_json: str = "",
    ast_matches_excerpt_json: str = "",
    retrieval_hits_pre_r1_json: str = "",
    retrieval_hits_pass2_json: str = "",
    repo_head_short: str = "",
    merge_branch_hints: str = "",
    env: dict[str, str],
) -> tuple[str, dict[str, Any] | None, bool, str | None, int | None]:
    """Returns (status, artifact, skipped_llm, warning, error_code). status ok|fail."""
    uq = (user_query or "").strip()
    fu = (follow_up or "").strip()
    hunk_j = (conflict_hunks_excerpt_json or "").strip() or "[]"
    ast_j = (ast_matches_excerpt_json or "").strip() or "[]"
    pre_r1_j = (retrieval_hits_pre_r1_json or "").strip() or "[]"
    pass2_j = (retrieval_hits_pass2_json or "").strip() or "[]"
    rhs = (repo_head_short or "").strip()
    hints = (merge_branch_hints or "").strip()
    plabel = (prior_refinement_pass_label or "").strip() or "none"
    prior_for_cache = (prior_phases_digest or "").strip()

    digest = digest_for_refinement_context(
        [
            left_intent,
            right_intent,
            conflict_regions_json,
            repo_structure_excerpt,
            uq,
            fu,
            hunk_j,
            ast_j,
            pre_r1_j,
            pass2_j,
            rhs,
            hints,
            plabel,
            prior_for_cache,
        ]
    )

    if mode == "off":
        return (
            "ok",
            {
                "schema": "tonic-question-refinement",
                "version": "1",
                "mode": "off",
                "refined_left_intent": left_intent,
                "refined_right_intent": right_intent,
                "context_digest_sha256": digest,
            },
            True,
            None,
            None,
        )

    key_name = config.openai_api_key_env or "OPENAI_API_KEY"
    api_key = (env.get(key_name) or "").strip()
    base_lower = config.llm_base_url.lower()
    localhost = "127.0.0.1" in base_lower or "localhost" in base_lower or "0.0.0.0" in base_lower
    allow_dummy = (env.get("TONIC_LLM_ALLOW_DUMMY_KEY") or "").strip() == "1"
    if not api_key and (localhost or allow_dummy):
        api_key = "dummy"
    if not api_key:
        if config.strict_llm:
            return "fail", None, True, f"missing API key env {key_name}", 11
        return (
            "ok",
            {
                "schema": "tonic-question-refinement",
                "version": "1",
                "mode": "off",
                "refined_left_intent": left_intent,
                "refined_right_intent": right_intent,
                "context_digest_sha256": digest,
                "prompt_template_ids": [f"skipped:{mode}"],
            },
            True,
            f"skipped question refinement: missing {key_name}",
            None,
        )

    timeout_ms = int((env.get("TONIC_LLM_TIMEOUT_MS") or "120000").strip() or "120000") or 120000
    template_id = "hydration.question_improver" if mode == "improver" else "hydration.subquestion_generator"
    system_id = (
        "hydration.question_improver_system" if mode == "improver" else "hydration.subquestion_generator_system"
    )
    system_body = load_hydration_prompt_body(system_id)
    if mode == "improver":
        system = (system_body or "").strip() or IMPROVER_SYSTEM_FALLBACK
    else:
        system = (system_body or "").strip() or SUBQ_SYSTEM_FALLBACK

    verbose_digest = (env.get("TONIC_LLM_VERBOSE_DIGEST") or "").strip() == "1"
    prior_hex = (prior_phases_digest or "").strip() if verbose_digest else ""

    vars = {
        "left_intent": left_intent,
        "right_intent": right_intent,
        "repo_structure_excerpt": repo_structure_excerpt,
        "conflict_regions_json": conflict_regions_json,
        "prior_phases_digest": prior_hex,
        "prior_refinement_pass_label": plabel,
        "user_query": uq,
        "follow_up": fu,
        "conflict_hunks_excerpt_json": hunk_j,
        "ast_matches_excerpt_json": ast_j,
        "retrieval_hits_pre_r1_json": pre_r1_j,
        "retrieval_hits_pass2_json": pass2_j,
        "repo_head_short": rhs,
        "merge_branch_hints": hints,
    }
    from_tpl = load_hydration_prompt_body(template_id)
    if from_tpl and from_tpl.strip():
        user = apply_hydration_template(from_tpl, vars)
    elif mode == "improver":
        user = (
            f"Left intent: {left_intent}\nRight intent: {right_intent}\n"
            f"Repo structure (excerpt):\n{repo_structure_excerpt}\n"
            f"Conflict regions (JSON):\n{conflict_regions_json}\nReturn JSON only."
        )
    else:
        user = (
            f"Left intent: {left_intent}\nRight intent: {right_intent}\n"
            f"Repo structure (excerpt):\n{repo_structure_excerpt}\n"
            f"Conflict regions (JSON):\n{conflict_regions_json}\n"
            "Propose up to 8 subquestions as JSON."
        )

    ok, text = call_llm_json(
        LlmChatParams(
            base_url=config.llm_base_url,
            model=config.llm_model,
            api_key=api_key,
            system=system,
            user=user,
            timeout_ms=timeout_ms,
            json_object=config.llm_json_object,
        )
    )
    if not ok:
        return "fail", None, False, text, 11

    p_ok, p_msg, partial = parse_question_refinement_json(text, mode)
    if not p_ok:
        return "fail", None, False, p_msg, 11

    base: dict[str, Any] = {
        "schema": "tonic-question-refinement",
        "version": "1",
        "mode": mode,
        "model_id": config.llm_model,
        "prompt_template_ids": [template_id],
        "context_digest_sha256": digest,
        **partial,
    }
    return "ok", base, False, None, None


def write_question_refinement(path_out: str, art: dict[str, Any]) -> None:
    p = Path(path_out).resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(art, indent=2) + "\n", encoding="utf-8")


def run_post_retrieval_question_refinement(
    *,
    config: ResolvedHydrationConfig,
    left_intent: str,
    right_intent: str,
    conflict_regions_json: str,
    repo_structure_excerpt: str,
    retrieval_hits_json: str,
    user_query: str = "",
    follow_up: str = "",
    env: dict[str, str],
) -> tuple[str, dict[str, Any] | None, bool, str | None, int | None]:
    """Returns (status, artifact, skipped_llm, warning, error_code). status ok|fail."""
    uq = (user_query or "").strip()
    fu = (follow_up or "").strip()
    digest = digest_for_refinement_context(
        [
            left_intent,
            right_intent,
            conflict_regions_json,
            repo_structure_excerpt,
            uq,
            fu,
            retrieval_hits_json,
            "post_retrieval",
        ]
    )

    key_name = config.openai_api_key_env or "OPENAI_API_KEY"
    api_key = (env.get(key_name) or "").strip()
    base_lower = config.llm_base_url.lower()
    localhost = "127.0.0.1" in base_lower or "localhost" in base_lower or "0.0.0.0" in base_lower
    allow_dummy = (env.get("TONIC_LLM_ALLOW_DUMMY_KEY") or "").strip() == "1"
    if not api_key and (localhost or allow_dummy):
        api_key = "dummy"
    if not api_key:
        if config.strict_llm:
            return "fail", None, True, f"missing API key env {key_name}", 11
        return (
            "ok",
            {
                "schema": "tonic-question-refinement-post-retrieval",
                "version": "1",
                "mode": "improver",
                "refined_left_intent": left_intent,
                "refined_right_intent": right_intent,
                "context_digest_sha256": digest,
                "prompt_template_ids": ["skipped:post_retrieval"],
            },
            True,
            f"skipped post-retrieval refinement: missing {key_name}",
            None,
        )

    timeout_ms = int((env.get("TONIC_LLM_TIMEOUT_MS") or "120000").strip() or "120000") or 120000
    system_body = load_hydration_prompt_body("hydration.intent_improver_post_retrieval_system")
    system = (system_body or "").strip() or POST_RETRIEVAL_SYSTEM_FALLBACK
    tpl = load_hydration_prompt_body("hydration.intent_improver_post_retrieval")
    vars_ = {
        "left_intent": left_intent,
        "right_intent": right_intent,
        "repo_structure_excerpt": repo_structure_excerpt,
        "conflict_regions_json": conflict_regions_json,
        "retrieval_hits_json": retrieval_hits_json,
        "user_query": uq,
        "follow_up": fu,
    }
    if tpl and tpl.strip():
        user = apply_hydration_template(tpl, vars_)
    else:
        user = (
            f"Refine intents using retrieval hits.\nLeft: {left_intent}\nRight: {right_intent}\n"
            f"Hits JSON:\n{retrieval_hits_json}\nReturn JSON only."
        )

    ok, text = call_llm_json(
        LlmChatParams(
            base_url=config.llm_base_url,
            model=config.llm_model,
            api_key=api_key,
            system=system,
            user=user,
            timeout_ms=timeout_ms,
            json_object=config.llm_json_object,
        )
    )
    if not ok:
        return "fail", None, False, text, 11

    p_ok, p_msg, partial = parse_question_refinement_json(text, "improver")
    if not p_ok:
        return "fail", None, False, p_msg, 11

    base: dict[str, Any] = {
        "schema": "tonic-question-refinement-post-retrieval",
        "version": "1",
        "mode": "improver",
        "model_id": config.llm_model,
        "prompt_template_ids": ["hydration.intent_improver_post_retrieval"],
        "context_digest_sha256": digest,
        **partial,
    }
    return "ok", base, False, None, None
