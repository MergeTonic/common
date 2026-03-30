"""Deterministic multi-cycle hydration modeling and metadata consolidation."""

from __future__ import annotations

from dataclasses import dataclass

from .ast_candidates import (
    extract_hydration_candidate_symbol,
    infer_hydration_candidate_node_kind,
)
from .types import (
    HYDRATION_PIPELINE_VERSION,
    HydrationBranchIntent,
    HydrationCandidateTag,
    HydrationConsolidatedPath,
    HydrationConsolidatedSymbol,
    HydrationCycleDelta,
    HydrationCycleNode,
    HydrationCycleRecord,
    HydrationCycleState,
    HydrationCycleTarget,
    HydrationFuzzyAlignmentCandidate,
    HydrationIntentSupport,
    HydrationMetadataConsolidation,
    HydrationQuestionSlot,
    HydrationRetrievalBundle,
    HydrationRetrievalMerge,
)

NOVELTY_DECAY = 0.2


@dataclass(frozen=True)
class _PathSupport:
    path: str
    support: int


def _score_path_support(retrieval_merge: HydrationRetrievalMerge) -> list[_PathSupport]:
    out: list[_PathSupport] = []
    for entry in retrieval_merge.evidence_by_path:
        support = (len(entry.slot_ids) * 2) + len(entry.chunk_ids) + max(1, len(entry.ast_node_ids))
        out.append(_PathSupport(path=entry.path, support=support))
    return sorted(out, key=lambda value: (-value.support, value.path))


def _target_key(target: HydrationCycleTarget) -> str:
    return "\x1f".join([target.level, target.path, target.symbol, target.label])


def _source_slot_ids_for_path(retrieval_merge: HydrationRetrievalMerge, file_path: str) -> list[str]:
    if not file_path:
        return []
    for entry in retrieval_merge.evidence_by_path:
        if entry.path == file_path:
            return list(entry.slot_ids)
    return []


def derive_next_cycle_targets(
    *,
    retrieval_merge: HydrationRetrievalMerge,
    fuzzy_alignment: list[HydrationFuzzyAlignmentCandidate],
    path_visit_counts: dict[str, int],
    seen_target_ids: set[str],
    max_targets: int,
) -> list[HydrationCycleTarget]:
    ranked_paths = _score_path_support(retrieval_merge)
    out: list[HydrationCycleTarget] = []
    seen_keys: set[str] = set()

    def push_target(target: HydrationCycleTarget) -> None:
        if len(out) >= max_targets:
            return
        if target.target_id in seen_target_ids:
            return
        key = _target_key(target)
        if key in seen_keys:
            return
        seen_keys.add(key)
        out.append(target)

    for evidence in ranked_paths[: max(1, max_targets // 2)]:
        explored_count = path_visit_counts.get(evidence.path, 0)
        novelty_boost = max(0.0, 1.0 - (explored_count * NOVELTY_DECAY))
        push_target(
            HydrationCycleTarget(
                target_id=f"module:{evidence.path}",
                level="module",
                label=evidence.path,
                path=evidence.path,
                source_node_ids=[],
            )
        )
        if novelty_boost <= 0.1 and len(out) >= max_targets:
            break

    for candidate in fuzzy_alignment:
        if len(out) >= max_targets:
            break
        symbol = extract_hydration_candidate_symbol(candidate)
        level = infer_hydration_candidate_node_kind(candidate)
        if (level == "span" or not symbol) and candidate.score < 0.55:
            continue
        push_target(
            HydrationCycleTarget(
                target_id=f"{level}:{candidate.ast_node_id}",
                level=level,
                label=symbol or candidate.ast_node_id,
                path=candidate.path,
                symbol=symbol,
                source_node_ids=[candidate.ast_node_id],
            )
        )

    if not out:
        for evidence in ranked_paths[:max_targets]:
            push_target(
                HydrationCycleTarget(
                    target_id=f"span:{evidence.path}:0:0",
                    level="span",
                    label=evidence.path,
                    path=evidence.path,
                    source_node_ids=[],
                )
            )

    return out


def build_hydration_cycle_record(
    *,
    cycle_number: int,
    targets: list[HydrationCycleTarget],
    question_slots: list[HydrationQuestionSlot],
    retrieval_bundles: list[HydrationRetrievalBundle],
    retrieval_merge: HydrationRetrievalMerge,
    fuzzy_alignment: list[HydrationFuzzyAlignmentCandidate],
    stop_reason: str = "",
) -> HydrationCycleRecord:
    nodes_added = [
        HydrationCycleNode(
            node_id=target.target_id,
            level=target.level,
            label=target.label,
            path=target.path,
            symbol=target.symbol,
            source_slot_ids=_source_slot_ids_for_path(retrieval_merge, target.path),
            status="hydrated",
        )
        for target in targets
    ]
    return HydrationCycleRecord(
        cycle_number=cycle_number,
        targets=targets,
        question_slots=question_slots,
        retrieval_bundles=retrieval_bundles,
        retrieval_merge=retrieval_merge,
        fuzzy_alignment=fuzzy_alignment,
        nodes_added=nodes_added,
        stop_reason=stop_reason,
    )


def build_final_hydration_cycle_state(
    *,
    cycles: list[HydrationCycleRecord],
    stop_reason: str,
) -> HydrationCycleState:
    nodes: list[HydrationCycleNode] = []
    for cycle in cycles:
        nodes.extend(cycle.nodes_added)
    return HydrationCycleState(
        total_cycles=len(cycles),
        stop_reason=stop_reason,
        nodes=nodes,
        cycles=cycles,
        pipeline_version=HYDRATION_PIPELINE_VERSION,
        schema="tonic-hydration-cycle",
    )


def _confidence_bucket(score: int) -> str:
    if score >= 6:
        return "high"
    if score >= 3:
        return "medium"
    return "low"


def build_hydration_metadata_consolidation(
    *,
    branch_intents: list[HydrationBranchIntent],
    cycles: list[HydrationCycleRecord],
) -> HydrationMetadataConsolidation:
    path_support: dict[str, dict[str, set[str] | set[int]]] = {}
    symbol_support: dict[str, dict[str, str | int | float]] = {}
    cycle_deltas: list[HydrationCycleDelta] = []
    seen_paths: set[str] = set()
    seen_symbols: set[str] = set()

    for cycle in cycles:
        cycle_paths: set[str] = set()
        cycle_symbols: set[str] = set()
        for evidence in cycle.retrieval_merge.evidence_by_path:
            current = path_support.setdefault(
                evidence.path,
                {"slot_support": set(), "chunk_support": set(), "cycle_support": set()},
            )
            slot_support = current["slot_support"]
            chunk_support = current["chunk_support"]
            cycle_support = current["cycle_support"]
            assert isinstance(slot_support, set)
            assert isinstance(chunk_support, set)
            assert isinstance(cycle_support, set)
            slot_support.update(evidence.slot_ids)
            chunk_support.update(evidence.chunk_ids)
            cycle_support.add(cycle.cycle_number)
            cycle_paths.add(evidence.path)
        for candidate in cycle.fuzzy_alignment:
            symbol = extract_hydration_candidate_symbol(candidate)
            if not symbol:
                continue
            key = f"{candidate.path}\x1f{symbol}"
            current = symbol_support.setdefault(
                key,
                {"path": candidate.path, "count": 0, "score_total": 0.0},
            )
            current["count"] = int(current["count"]) + 1
            current["score_total"] = float(current["score_total"]) + float(candidate.score)
            cycle_symbols.add(key)

        new_paths = sorted([entry for entry in cycle_paths if entry not in seen_paths])
        repeated_paths = sorted([entry for entry in cycle_paths if entry in seen_paths])
        new_symbols = sorted([entry for entry in cycle_symbols if entry not in seen_symbols])
        repeated_symbols = sorted([entry for entry in cycle_symbols if entry in seen_symbols])
        seen_paths.update(new_paths)
        seen_symbols.update(new_symbols)
        total_signals = len(cycle_paths) + len(cycle_symbols)
        novelty_signals = len(new_paths) + len(new_symbols)
        cycle_deltas.append(
            HydrationCycleDelta(
                cycle_number=cycle.cycle_number,
                new_paths=new_paths,
                repeated_paths=repeated_paths,
                new_symbols=[entry.split("\x1f")[1] if "\x1f" in entry else entry for entry in new_symbols],
                repeated_symbols=[entry.split("\x1f")[1] if "\x1f" in entry else entry for entry in repeated_symbols],
                novelty_ratio=round((novelty_signals / total_signals), 6) if total_signals else 0.0,
            )
        )

    paths_ranked = sorted(
        [
            HydrationConsolidatedPath(
                path=file_path,
                support=(len(slot_support) * 2) + len(chunk_support) + len(cycle_support),
                slot_support=len(slot_support),
                chunk_support=len(chunk_support),
                cycle_support=len(cycle_support),
                novelty_score=round(1.0 / max(1, len(cycle_support)), 6),
            )
            for file_path, support in path_support.items()
            for slot_support, chunk_support, cycle_support in [
                (
                    support["slot_support"] if isinstance(support["slot_support"], set) else set(),
                    support["chunk_support"] if isinstance(support["chunk_support"], set) else set(),
                    support["cycle_support"] if isinstance(support["cycle_support"], set) else set(),
                )
            ]
        ],
        key=lambda entry: (-entry.support, entry.path),
    )[:32]

    symbols_ranked = sorted(
        [
            HydrationConsolidatedSymbol(
                symbol=(key.split("\x1f")[1] if "\x1f" in key else key),
                path=str(value.get("path", "")),
                support=int(value.get("count", 0)),
                avg_score=round(float(value.get("score_total", 0.0)) / max(1, int(value.get("count", 0))), 6),
            )
            for key, value in symbol_support.items()
        ],
        key=lambda entry: (-entry.support, -entry.avg_score, entry.symbol),
    )[:32]

    intent_support: list[HydrationIntentSupport] = []
    for index, intent in enumerate(branch_intents):
        path_slice = paths_ranked[index * 2 : (index * 2) + 3]
        symbol_slice = symbols_ranked[index * 2 : (index * 2) + 3]
        score = sum(entry.support for entry in path_slice) + sum(entry.support for entry in symbol_slice)
        intent_support.append(
            HydrationIntentSupport(
                intent_id=intent.intent_id,
                description=intent.description,
                support_paths=[entry.path for entry in path_slice],
                support_symbols=[entry.symbol for entry in symbol_slice],
                support_score=score,
            )
        )

    candidate_tags: list[HydrationCandidateTag] = []
    primary_intent = branch_intents[0] if branch_intents else None
    if primary_intent is not None:
        slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in primary_intent.description).strip("-")
        while "--" in slug:
            slug = slug.replace("--", "-")
        candidate_tags.append(
            HydrationCandidateTag(
                key="tonic.ai.intent",
                value=(slug[:48] if slug else "hydration"),
                support=max(1, intent_support[0].support_score if intent_support else 1),
                confidence=_confidence_bucket(intent_support[0].support_score if intent_support else 1),
            )
        )
    for entry in paths_ranked[:2]:
        candidate_tags.append(
            HydrationCandidateTag(
                key="tonic.ai.path",
                value=entry.path,
                support=entry.support,
                confidence=_confidence_bucket(entry.support),
            )
        )
    for entry in symbols_ranked[:2]:
        candidate_tags.append(
            HydrationCandidateTag(
                key="tonic.ai.symbol",
                value=entry.symbol,
                support=entry.support,
                confidence=_confidence_bucket(entry.support),
            )
        )

    return HydrationMetadataConsolidation(
        schema="tonic-hydration-metadata-consolidation",
        pipeline_version=HYDRATION_PIPELINE_VERSION,
        paths_ranked=paths_ranked,
        symbols_ranked=symbols_ranked,
        intent_support=intent_support,
        cycle_deltas=cycle_deltas,
        candidate_tags=candidate_tags,
    )
