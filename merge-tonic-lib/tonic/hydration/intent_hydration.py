"""Higher-level intent-hydration helpers layered on top of vendored search."""

from __future__ import annotations

from dataclasses import asdict
import json
import re
from typing import Callable

from .ast_candidates import (
    extract_hydration_candidate_symbol,
    infer_hydration_candidate_node_kind,
)
from .cycle_model import (
    build_final_hydration_cycle_state,
    build_hydration_cycle_record,
)
from .prompt_bundle import (
    question_generation_system_prompt,
    question_generation_user_prompt,
    synthesis_system_prompt,
    synthesis_user_prompt,
)
from .types import (
    HydrationBranchIntent,
    HydrationCycleState,
    HydrationCycleTarget,
    HydrationFuzzyAlignmentCandidate,
    HydrationIntentTag,
    HydrationMetadataConsolidation,
    HydrationQuestionSlot,
    HydrationRetrievalBundle,
    HydrationRetrievalMerge,
)

HydrationIntentLlmEvent = dict[str, object]

QUESTION_PLAN_SCHEMA_DESCRIPTION = (
    '{"question_slots":[{"id":"string","question":"string","strategy":"guided-llm-meta|template"}]}'
)

SYNTHESIS_SCHEMA_DESCRIPTION = (
    '{"tags":[{"key":"string","value":"string","display":"string"}],"rationale":"string"}'
)

TOKEN_STOPWORDS = {
    "the",
    "and",
    "for",
    "this",
    "that",
    "with",
    "from",
    "into",
    "what",
    "which",
    "where",
    "when",
    "does",
    "most",
    "current",
    "branch",
    "intent",
    "intents",
    "hydrate",
    "hydration",
    "repository",
    "context",
    "files",
    "file",
    "modules",
    "module",
    "symbols",
    "symbol",
    "implement",
    "affect",
    "relevant",
    "code",
    "paths",
    "path",
}


def _tokenize(value: str) -> list[str]:
    return sorted(
        {
            entry.strip()
            for entry in re.split(r"[^a-z0-9_./-]+", value.lower())
            if len(entry.strip()) >= 3 and entry.strip() not in TOKEN_STOPWORDS
        }
    )


def _slugify(value: str, max_length: int) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not normalized:
        return "hydration"
    return re.sub(r"-+$", "", normalized[:max_length]) or "hydration"


def _sentence_case(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        return ""
    if len(trimmed) == 1:
        return trimmed.upper()
    return trimmed[0].upper() + trimmed[1:]


def _sanitize_tag_key(value: str) -> str:
    trimmed = value.strip().lower()
    if not trimmed:
        return ""
    normalized = re.sub(r"[^a-z0-9._-]+", ".", trimmed).strip(".")
    if not normalized:
        return ""
    return normalized if normalized.startswith("tonic.") else f"tonic.ai.{normalized}"


def _sanitize_tag_value(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()[:96]


def _sanitize_tag(raw: HydrationIntentTag | dict[str, str] | None) -> HydrationIntentTag | None:
    if raw is None:
        return None
    key = _sanitize_tag_key(raw.key if isinstance(raw, HydrationIntentTag) else raw.get("key", ""))
    value = _sanitize_tag_value(raw.value if isinstance(raw, HydrationIntentTag) else raw.get("value", ""))
    if not key or not value:
        return None
    display_value = raw.display if isinstance(raw, HydrationIntentTag) else raw.get("display", "")
    display = _sanitize_tag_value(display_value)
    return HydrationIntentTag(key=key, value=value, display=display)


def _dedupe_tags(tags: list[HydrationIntentTag]) -> list[HydrationIntentTag]:
    seen: set[tuple[str, str]] = set()
    out: list[HydrationIntentTag] = []
    for tag in tags:
        normalized = _sanitize_tag(tag)
        if normalized is None:
            continue
        key = (normalized.key, normalized.value)
        if key in seen:
            continue
        seen.add(key)
        out.append(normalized)
    return out[:6]


def _render_branch_intent_list(branch_intents: list[HydrationBranchIntent]) -> str:
    if not branch_intents:
        return "(none)"
    return "\n".join(f"- {intent.intent_id}: {intent.description}" for intent in branch_intents)


def _render_question_list(question_slots: list[HydrationQuestionSlot]) -> str:
    if not question_slots:
        return "(none)"
    return "\n".join(f"- {slot.id}: {slot.question}" for slot in question_slots)


def _build_fallback_question_slots(
    *,
    branch_intents: list[HydrationBranchIntent],
    max_questions: int,
) -> list[HydrationQuestionSlot]:
    templates = [
        "Which files, modules, or entrypoints implement or affect this intent: {intent}?",
        "Which exported symbols or declarations are central to this intent: {intent}?",
        "Which callers, dependencies, or surrounding code paths influence this intent: {intent}?",
    ]
    intents = list(branch_intents)
    if not intents:
        intents = [
            HydrationBranchIntent(
                branch_id="primary",
                intent_id="intent-1",
                description="hydrate repository context for current branch intents",
                source_kind="text",
                source_value="hydrate repository context for current branch intents",
            )
        ]
    out: list[HydrationQuestionSlot] = []
    for intent in intents:
        for template in templates:
            if len(out) >= max_questions:
                return out
            out.append(
                HydrationQuestionSlot(
                    id=f"q-{len(out) + 1}",
                    question=template.replace("{intent}", intent.description),
                    strategy="template",
                )
            )
    return out


def _normalize_question_slots(raw: object, max_questions: int) -> list[HydrationQuestionSlot]:
    if not isinstance(raw, dict):
        return []
    source = raw.get("question_slots")
    if not isinstance(source, list):
        source = raw.get("slots")
    if not isinstance(source, list):
        return []
    out: list[HydrationQuestionSlot] = []
    used_ids: set[str] = set()
    for entry in source:
        if not isinstance(entry, dict):
            continue
        question = str(entry.get("question", "")).strip()
        if not question:
            continue
        slot_id = str(entry.get("id", "")).strip() or f"q-{len(out) + 1}"
        while slot_id in used_ids:
            slot_id = f"{slot_id}-{len(out) + 1}"
        used_ids.add(slot_id)
        strategy = "template" if str(entry.get("strategy", "")).strip() == "template" else "guided-llm-meta"
        out.append(HydrationQuestionSlot(id=slot_id, question=question, strategy=strategy))
        if len(out) >= max_questions:
            break
    return out


def plan_hydration_question_slots(
    *,
    repo_root: str,
    branch_intents: list[HydrationBranchIntent],
    downstream_task: str,
    max_questions: int,
    scope: str = "",
    prompt_profile: str = "",
    llm_service: object | None = None,
    hydrated_context: str = "",
    prior_questions: list[HydrationQuestionSlot] | None = None,
    on_llm_event: Callable[[HydrationIntentLlmEvent], None] | None = None,
) -> list[HydrationQuestionSlot]:
    fallback = _build_fallback_question_slots(
        branch_intents=branch_intents,
        max_questions=max_questions,
    )
    if llm_service is None:
        return fallback
    request_payload = {
        "messages": [
            {
                "role": "system",
                "content": question_generation_system_prompt(prompt_profile),
            },
            {
                "role": "user",
                "content": question_generation_user_prompt(
                    repo_root=repo_root,
                    scope=scope or ".",
                    downstream_task=downstream_task,
                    branch_intents=_render_branch_intent_list(branch_intents),
                    hydrated_context=hydrated_context or "(none)",
                    max_questions=str(max_questions),
                    prior_questions=_render_question_list(prior_questions or []),
                    prompt_profile=prompt_profile,
                ),
            },
        ],
        "schema_name": "hydration_question_plan",
        "schema_description": QUESTION_PLAN_SCHEMA_DESCRIPTION,
    }
    if on_llm_event is not None:
        on_llm_event(
            {
                "event": "llm_request",
                "schemaName": request_payload["schema_name"],
                "provider": getattr(llm_service, "provider_id", ""),
                "model": getattr(llm_service, "model", ""),
                "requestJson": request_payload,
            }
        )
    try:
        response = llm_service.generate_json(**request_payload)
        if on_llm_event is not None:
            on_llm_event(
                {
                    "event": "llm_response",
                    "schemaName": request_payload["schema_name"],
                    "provider": getattr(llm_service, "provider_id", ""),
                    "model": getattr(llm_service, "model", ""),
                    "responseJson": response,
                }
            )
        planned = _normalize_question_slots(response, max_questions)
        return planned or fallback
    except Exception as exc:
        if on_llm_event is not None:
            on_llm_event(
                {
                    "event": "llm_error",
                    "schemaName": request_payload["schema_name"],
                    "provider": getattr(llm_service, "provider_id", ""),
                    "model": getattr(llm_service, "model", ""),
                    "note": str(exc),
                }
            )
        return fallback


def _score_evidence_paths(retrieval_bundles: list[HydrationRetrievalBundle]) -> dict[str, float]:
    scores: dict[str, float] = {}
    for bundle in retrieval_bundles:
        for hit in bundle.vector_hits:
            scores[hit.path] = scores.get(hit.path, 0.0) + max(0.01, float(hit.score))
        for candidate in bundle.ast_candidates:
            scores[candidate.path] = scores.get(candidate.path, 0.0) + max(0.01, float(candidate.score) * 0.5)
    return scores


def _rank_evidence_paths(retrieval_bundles: list[HydrationRetrievalBundle]) -> list[str]:
    return [
        file_path
        for file_path, _ in sorted(
            _score_evidence_paths(retrieval_bundles).items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]


def build_hydration_fuzzy_alignment(
    *,
    retrieval_bundles: list[HydrationRetrievalBundle],
    retrieval_merge: HydrationRetrievalMerge,
) -> list[HydrationFuzzyAlignmentCandidate]:
    ranked_paths = list(
        dict.fromkeys(
            [
                *_rank_evidence_paths(retrieval_bundles),
                *(entry.path for entry in retrieval_merge.evidence_by_path),
            ]
        )
    )
    path_rank = {file_path: index for index, file_path in enumerate(ranked_paths)}
    aggregated: dict[str, HydrationFuzzyAlignmentCandidate] = {}
    for bundle in retrieval_bundles:
        question_tokens = _tokenize(bundle.question)
        for candidate in bundle.ast_candidates:
            same_path_hits = [hit for hit in bundle.vector_hits if hit.path == candidate.path]
            overlap_score = (
                min(1.0, len(same_path_hits) / max(1, len(bundle.vector_hits)))
                if bundle.vector_hits
                else 0.0
            )
            candidate_tokens = _tokenize(
                f"{candidate.ast_node_id} {candidate.path} {candidate.symbol} {candidate.node_kind or ''}"
            )
            shared_token_count = len([token for token in question_tokens if token in candidate_tokens])
            token_score = (
                min(1.0, shared_token_count / max(1, len(question_tokens)))
                if question_tokens
                else 0.0
            )
            rank_index = path_rank.get(candidate.path, len(ranked_paths))
            denominator = max(1, len(ranked_paths))
            path_distance_score = max(0.0, 1.0 - rank_index / denominator)
            score = (
                float(candidate.score) * 0.45
                + overlap_score * 0.3
                + token_score * 0.15
                + path_distance_score * 0.1
            )
            existing = aggregated.get(candidate.ast_node_id)
            if existing is None or score > existing.score:
                aggregated[candidate.ast_node_id] = HydrationFuzzyAlignmentCandidate(
                    ast_node_id=candidate.ast_node_id,
                    path=candidate.path,
                    score=round(score, 6),
                    overlap_score=round(overlap_score, 6),
                    token_score=round(token_score, 6),
                    path_distance_score=round(path_distance_score, 6),
                )
    for evidence in retrieval_merge.evidence_by_path:
        if evidence.ast_node_ids:
            continue
        fallback_id = f"span:{evidence.path}:0:0"
        if fallback_id in aggregated:
            continue
        slot_score = min(1.0, len(evidence.slot_ids) / max(1, len(retrieval_bundles)))
        chunk_score = min(1.0, len(evidence.chunk_ids) / max(1, len(evidence.chunk_ids) + 1))
        aggregated[fallback_id] = HydrationFuzzyAlignmentCandidate(
            ast_node_id=fallback_id,
            path=evidence.path,
            score=round(slot_score * 0.6 + chunk_score * 0.4, 6),
            overlap_score=round(slot_score, 6),
            token_score=0.0,
            path_distance_score=round(chunk_score, 6),
        )
    return sorted(
        aggregated.values(),
        key=lambda candidate: (-candidate.score, candidate.ast_node_id),
    )[:12]


def build_hydration_cycle_state(
    *,
    branch_intents: list[HydrationBranchIntent],
    retrieval_merge: HydrationRetrievalMerge,
    fuzzy_alignment: list[HydrationFuzzyAlignmentCandidate],
) -> HydrationCycleState:
    targets: list[HydrationCycleTarget] = []
    for intent in branch_intents:
        targets.append(
            HydrationCycleTarget(
                target_id=f"branch:{intent.intent_id}",
                level="branch",
                label=_sentence_case(intent.description),
                source_node_ids=[],
            )
        )
    for evidence in retrieval_merge.evidence_by_path[:8]:
        targets.append(
            HydrationCycleTarget(
                target_id=f"module:{evidence.path}",
                level="module",
                label=evidence.path,
                path=evidence.path,
                source_node_ids=[],
            )
        )
    for candidate in fuzzy_alignment[:8]:
        symbol = extract_hydration_candidate_symbol(candidate)
        targets.append(
            HydrationCycleTarget(
                target_id=candidate.ast_node_id,
                level=infer_hydration_candidate_node_kind(candidate),
                label=symbol or candidate.ast_node_id,
                path=candidate.path,
                symbol=symbol,
                source_node_ids=[candidate.ast_node_id],
            )
        )
    cycle_record = build_hydration_cycle_record(
        cycle_number=1,
        targets=targets,
        question_slots=[],
        retrieval_bundles=retrieval_merge.retrieval_bundles,
        retrieval_merge=retrieval_merge,
        fuzzy_alignment=fuzzy_alignment,
    )
    return build_final_hydration_cycle_state(cycles=[cycle_record], stop_reason="max_cycles")


def _derive_deterministic_tags(
    *,
    branch_intents: list[HydrationBranchIntent],
    metadata_consolidation: HydrationMetadataConsolidation | None = None,
) -> tuple[list[HydrationIntentTag], str]:
    primary_intent = branch_intents[0].description if branch_intents else "hydrate repository context"
    top_path = metadata_consolidation.paths_ranked[0].path if metadata_consolidation and metadata_consolidation.paths_ranked else ""
    top_symbol = metadata_consolidation.symbols_ranked[0].symbol if metadata_consolidation and metadata_consolidation.symbols_ranked else ""
    tags = _dedupe_tags(
        [
            tag
            for tag in [
                HydrationIntentTag(
                    key="intent",
                    value=_slugify(primary_intent, 48),
                    display=primary_intent[:96],
                ),
                HydrationIntentTag(key="path", value=top_path) if top_path else None,
                HydrationIntentTag(key="symbol", value=top_symbol) if top_symbol else None,
            ]
            if tag is not None
        ]
    )
    rationale_parts = [f"Primary intent '{primary_intent}'"]
    if top_path:
        rationale_parts.append(f"clusters in {top_path}")
    if top_symbol:
        rationale_parts.append(f"around {top_symbol}")
    rationale = " ".join(rationale_parts).replace(" .", ".").strip() + "."
    return tags, rationale


def _normalize_synthesis_tags(raw: object) -> list[HydrationIntentTag]:
    if not isinstance(raw, list):
        return []
    tags: list[HydrationIntentTag] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        normalized = _sanitize_tag(
            {
                "key": str(entry.get("key", "")),
                "value": str(entry.get("value", "")),
                "display": str(entry.get("display", "")),
            }
        )
        if normalized is not None:
            tags.append(normalized)
    return _dedupe_tags(tags)


def synthesize_hydration_metadata(
    *,
    repo_root: str,
    branch_intents: list[HydrationBranchIntent],
    question_slots: list[HydrationQuestionSlot],
    metadata_consolidation: HydrationMetadataConsolidation,
    retrieval_bundles: list[HydrationRetrievalBundle] | None = None,
    fuzzy_alignment: list[HydrationFuzzyAlignmentCandidate] | None = None,
    prompt_profile: str = "",
    llm_service: object | None = None,
    on_llm_event: Callable[[HydrationIntentLlmEvent], None] | None = None,
) -> tuple[list[HydrationIntentTag], str]:
    fallback_tags, fallback_rationale = _derive_deterministic_tags(
        branch_intents=branch_intents,
        metadata_consolidation=metadata_consolidation,
    )
    if llm_service is None:
        return fallback_tags, fallback_rationale
    primary_path = metadata_consolidation.paths_ranked[0].path if metadata_consolidation.paths_ranked else "."
    request_payload = {
        "messages": [
            {
                "role": "system",
                "content": synthesis_system_prompt(prompt_profile),
            },
            {
                "role": "user",
                "content": synthesis_user_prompt(
                    repo_root=repo_root,
                    path=primary_path,
                    intent_spec=_render_branch_intent_list(branch_intents),
                    question_slots=json.dumps([asdict(slot) for slot in question_slots], indent=2),
                    retrieval_bundles=json.dumps([asdict(bundle) for bundle in (retrieval_bundles or [])], indent=2),
                    fuzzy_alignment=json.dumps([asdict(candidate) for candidate in (fuzzy_alignment or [])], indent=2),
                    metadata_consolidation=json.dumps(asdict(metadata_consolidation), indent=2),
                    prompt_profile=prompt_profile,
                ),
            },
        ],
        "schema_name": "hydration_metadata_synthesis",
        "schema_description": SYNTHESIS_SCHEMA_DESCRIPTION,
    }
    if on_llm_event is not None:
        on_llm_event(
            {
                "event": "llm_request",
                "schemaName": request_payload["schema_name"],
                "provider": getattr(llm_service, "provider_id", ""),
                "model": getattr(llm_service, "model", ""),
                "requestJson": request_payload,
            }
        )
    try:
        response = llm_service.generate_json(**request_payload)
        if on_llm_event is not None:
            on_llm_event(
                {
                    "event": "llm_response",
                    "schemaName": request_payload["schema_name"],
                    "provider": getattr(llm_service, "provider_id", ""),
                    "model": getattr(llm_service, "model", ""),
                    "responseJson": response,
                }
            )
        tags = _normalize_synthesis_tags(response.get("tags") if isinstance(response, dict) else None)
        rationale = (
            str(response.get("rationale", "")).strip()
            if isinstance(response, dict)
            else ""
        ) or fallback_rationale
        return (tags or fallback_tags), rationale
    except Exception as exc:
        if on_llm_event is not None:
            on_llm_event(
                {
                    "event": "llm_error",
                    "schemaName": request_payload["schema_name"],
                    "provider": getattr(llm_service, "provider_id", ""),
                    "model": getattr(llm_service, "model", ""),
                    "note": str(exc),
                }
            )
        return fallback_tags, fallback_rationale
