"""Shared machine-mode hydration runner used by CLI wrappers."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from pathlib import Path
import re
import subprocess
from typing import Any

from .ast_candidates import build_hydration_ast_candidates
from .cycle_model import (
    build_final_hydration_cycle_state,
    build_hydration_cycle_record,
    build_hydration_metadata_consolidation,
    derive_next_cycle_targets,
)
from .embedder import DeterministicFakeEmbedder
from .indexer import HydrationIndexer
from .intent_hydration import (
    build_hydration_fuzzy_alignment,
    plan_hydration_question_slots,
    synthesize_hydration_metadata,
)
from .llm_service import create_hydration_llm_service
from .llm_transcript import append_hydration_llm_transcript_event
from .optional_ai import (
    build_missing_optional_ai_dependency_skip_result,
    probe_hydration_optional_ai_dependency,
    skip_result_to_dict,
)
from .persistence import (
    acquire_hydration_persist_lock,
    assert_hydration_persist_health,
    build_hydration_cache_key,
)
from .repository import HydrationRepository
from .run_state import (
    create_hydration_branch_intent_collection,
    create_hydration_pipeline_run,
    create_hydration_question_plan,
    default_hydration_run_id,
    finalize_hydration_pipeline_run,
    mark_stage_artifact_written,
    save_hydration_pipeline_run,
    update_hydration_pipeline_stage,
    write_hydration_artifact,
    build_hydration_retrieval_merge,
)
from .runtime import create_hydration_runtime, probe_hydration_runtime_readiness
from .runtime_config import resolve_hydration_runtime_config
from .types import (
    HYDRATION_OPTIONAL_AI_EXIT_CODE,
    HydrationBranchIntent,
    HydrationCycleRecord,
    HydrationCycleTarget,
    HydrationQuestionSlot,
    HydrationRetrievalBundle,
    HydrationRetrievalHit,
)
from .agentic_code_search import run_agentic_code_search_session


@dataclass(frozen=True)
class HydrationHistoricalOptions:
    max_prs: int = 0
    since: str = ""
    base_ref: str = ""
    state: str = "merged"


@dataclass(frozen=True)
class RunHydrateIntentsOptions:
    intent_text: str = ""
    intent_spec: str = ""
    scope: str = ""
    dry_run: bool = False
    prompt_profile: str = ""
    log_llm: str = ""
    max_questions: int = 3
    query_top_k: int = 5
    downstream_task: str = ""
    historical: HydrationHistoricalOptions = HydrationHistoricalOptions()
    vendoring_scaffold: bool = False
    env: dict[str, str] | None = None


@dataclass(frozen=True)
class RunHydrateIntentsResult:
    exit_code: int
    payload: dict[str, object]


def _normalize_scope_patterns(raw_scope: str) -> list[str]:
    if not raw_scope.strip():
        return []
    return [entry.strip() for entry in re.split(r"[,\n;]+", raw_scope) if entry.strip()]


def _normalize_question_key(question: str) -> str:
    return re.sub(r"\s+", " ", question.lower()).strip()


def _resolve_transcript_path(repo_root: str, explicit_path: str) -> str:
    candidate = explicit_path.strip()
    if not candidate:
        return ""
    return str(Path(candidate).resolve() if Path(candidate).is_absolute() else (Path(repo_root) / candidate).resolve())


def _summarize_targets(targets: list[HydrationCycleTarget]) -> str:
    if not targets:
        return "(none)"
    return "\n".join(
        f"{target.level}:{target.path or target.symbol or target.label}"
        for target in targets[:8]
    )


def _build_targeted_question_slots(
    *,
    targets: list[HydrationCycleTarget],
    cycle_number: int,
    max_questions: int,
) -> list[HydrationQuestionSlot]:
    out: list[HydrationQuestionSlot] = []
    for target in targets:
        if len(out) >= max_questions:
            break
        if target.symbol:
            out.append(
                HydrationQuestionSlot(
                    id=f"c{cycle_number}-q{len(out) + 1}",
                    question=f"How does {target.symbol} in {target.path or 'this module'} implement current branch intents?",
                    strategy="template",
                )
            )
            continue
        if target.path:
            out.append(
                HydrationQuestionSlot(
                    id=f"c{cycle_number}-q{len(out) + 1}",
                    question=f"Which declarations in {target.path} are most relevant to current branch intents?",
                    strategy="template",
                )
            )
    return out


def _parse_intent_spec(repo_root: str, spec_path: str) -> list[HydrationBranchIntent]:
    resolved = (Path(repo_root) / spec_path).resolve()
    try:
        payload = json.loads(resolved.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ValueError(f"Failed to parse --intent-spec '{spec_path}': {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"Invalid --intent-spec '{spec_path}': expected a JSON object.")

    if payload.get("schema") == "tonic-branch-intents" and isinstance(payload.get("branch_intents"), list):
        intents: list[HydrationBranchIntent] = []
        for index, entry in enumerate(payload["branch_intents"]):
            if not isinstance(entry, dict):
                continue
            description = str(entry.get("description", "")).strip()
            if not description:
                continue
            intents.append(
                HydrationBranchIntent(
                    branch_id=str(entry.get("branch_id", "primary")).strip() or "primary",
                    intent_id=str(entry.get("intent_id", f"intent-{index + 1}")).strip() or f"intent-{index + 1}",
                    description=description,
                    source_kind="file",
                    source_value=str(resolved),
                    priority=entry.get("priority") if entry.get("priority") in {"high", "medium", "low"} else None,
                    scope=str(entry.get("scope", "")),
                )
            )
        return intents
    if payload.get("schema") == "tonic-intent-spec" and isinstance(payload.get("intents"), list):
        intents = []
        for index, entry in enumerate(payload["intents"]):
            if not isinstance(entry, dict):
                continue
            description = str(entry.get("description", "")).strip()
            if not description:
                continue
            intents.append(
                HydrationBranchIntent(
                    branch_id="primary",
                    intent_id=str(entry.get("id", f"intent-{index + 1}")).strip() or f"intent-{index + 1}",
                    description=description,
                    source_kind="file",
                    source_value=str(resolved),
                    priority=entry.get("priority") if entry.get("priority") in {"high", "medium", "low"} else None,
                )
            )
        return intents
    raise ValueError(
        f"Invalid --intent-spec '{spec_path}': expected schema 'tonic-branch-intents' or 'tonic-intent-spec'."
    )


def _build_branch_intents(repo_root: str, intent_text: str, intent_spec: str) -> list[HydrationBranchIntent]:
    from_spec = _parse_intent_spec(repo_root, intent_spec) if intent_spec.strip() else []
    from_text = [
        HydrationBranchIntent(
            branch_id="primary",
            intent_id=f"text-intent-{index + 1}",
            description=description,
            source_kind="text",
            source_value=description,
        )
        for index, description in enumerate(
            [entry.strip() for entry in re.split(r"[\r\n;]+", intent_text or "") if entry.strip()]
        )
    ]
    combined = [*from_spec, *from_text]
    if combined:
        return combined
    return [
        HydrationBranchIntent(
            branch_id="primary",
            intent_id="intent-1",
            description="hydrate repository context for current branch intents",
            source_kind="text",
            source_value="hydrate repository context for current branch intents",
        )
    ]


def _collect_historical_expansion(repo_root: str, historical: HydrationHistoricalOptions) -> tuple[list[str], list[str]]:
    if historical.max_prs <= 0 or historical.state == "open":
        return [], []
    max_commits = max(0, min(50, int(historical.max_prs)))
    if max_commits == 0:
        return [], []
    range_expr = f"{historical.base_ref.strip()}..HEAD" if historical.base_ref.strip() else "HEAD"
    commit_args = ["git", "-C", repo_root, "rev-list", "--max-count", str(max_commits)]
    if historical.since.strip():
        commit_args.append(f"--since={historical.since.strip()}")
    commit_args.append(range_expr)
    try:
        commit_output = subprocess.run(commit_args, check=True, capture_output=True, text=True, encoding="utf-8").stdout
    except Exception:
        return [], []
    commit_ids = [entry.strip() for entry in commit_output.splitlines() if entry.strip()]
    file_paths: set[str] = set()
    for commit_id in commit_ids:
        try:
            show_output = subprocess.run(
                ["git", "-C", repo_root, "show", "--pretty=format:", "--name-only", commit_id],
                check=True,
                capture_output=True,
                text=True,
                encoding="utf-8",
            ).stdout
        except Exception:
            continue
        for file_path in [entry.strip() for entry in show_output.splitlines() if entry.strip()]:
            if ".." in file_path or Path(file_path).is_absolute():
                continue
            file_paths.add(file_path.replace("\\", "/"))
            if len(file_paths) >= 500:
                break
        if len(file_paths) >= 500:
            break
    return commit_ids, sorted(file_paths)


def run_hydrate_intents_machine_mode(repo_root: str, options: RunHydrateIntentsOptions) -> RunHydrateIntentsResult:
    env = options.env or None
    runtime = resolve_hydration_runtime_config(repo_root, env)
    if runtime.mode != "memory":
        probe = probe_hydration_optional_ai_dependency()
        if not probe.available:
            skip = build_missing_optional_ai_dependency_skip_result(repo_root, probe.install_hint)
            return RunHydrateIntentsResult(
                exit_code=HYDRATION_OPTIONAL_AI_EXIT_CODE,
                payload=skip_result_to_dict(skip),
            )
    assert_hydration_persist_health(runtime.persist_path)
    if runtime.mode == "http":
        readiness = probe_hydration_runtime_readiness(repo_root, env)
        if readiness is None or not readiness.ok:
            return RunHydrateIntentsResult(
                exit_code=1,
                payload={
                    "ok": False,
                    "hydration_skipped": True,
                    "skip_reason": "missing_configuration",
                    "runtime_mode": runtime.mode,
                    "heartbeat_url": readiness.heartbeat_url if readiness else "",
                    "error": readiness.error if readiness else "Chroma heartbeat probe failed.",
                },
            )

    run_id = default_hydration_run_id()
    dry_run = bool(options.dry_run)
    runtime_overrides: dict[str, str] = {}
    if dry_run and runtime.mode != "memory":
        runtime_overrides["collection_name"] = f"{runtime.collection_name}-dryrun-{run_id[:8]}"
    runtime_bundle = create_hydration_runtime(repo_root, env, runtime_overrides)
    run = create_hydration_pipeline_run(repo_root=repo_root, vector_backend=runtime_bundle.backend, run_id=run_id)
    transcript_path = _resolve_transcript_path(repo_root, options.log_llm)
    if transcript_path:
        run.artifacts.llm_transcript_path = transcript_path

    lock = None if runtime.mode == "memory" else acquire_hydration_persist_lock(runtime.persist_path, f"merge-tonic:{run.run_id}")
    try:
        max_questions = max(1, int(options.max_questions))
        query_top_k = max(1, int(options.query_top_k))
        downstream_task = options.downstream_task.strip() or "hydrate intent tags for current repository context"
        prompt_profile = options.prompt_profile.strip()
        scope_patterns = _normalize_scope_patterns(options.scope)
        scope_label = ",".join(scope_patterns) if scope_patterns else "."
        branch_intents = _build_branch_intents(repo_root, options.intent_text, options.intent_spec)
        historical_commit_ids, historical_paths = _collect_historical_expansion(repo_root, options.historical)

        embedder = DeterministicFakeEmbedder()
        hydration_llm_service = create_hydration_llm_service()
        cache_key = build_hydration_cache_key(
            strategy_id="incremental-content-hash",
            pr_identifiers=historical_commit_ids,
            embedder_model=embedder.model_id,
            chunker_version="line-estimate-v1",
            scope=scope_label,
            prompt_profile=prompt_profile,
            dry_run=dry_run,
            historical_since=options.historical.since,
            historical_base_ref=options.historical.base_ref,
            historical_state=options.historical.state,
        )

        update_hydration_pipeline_stage(run, "config.resolve", status="running")
        save_hydration_pipeline_run(run)
        resolved_config = {
            "schema": "tonic-hydration-resolved-config",
            "pipeline_version": run.pipeline_version,
            "runtime_mode": runtime.mode,
            "vector_backend": runtime_bundle.backend,
            "collection_name": runtime_bundle.config.collection_name,
            "persist_path": str(runtime.persist_path),
            "chroma_url": runtime.url,
            "heartbeat_path": runtime.heartbeat_path,
            "max_questions": max_questions,
            "query_top_k": query_top_k,
            "scope": scope_label,
            "prompt_profile": prompt_profile or "default",
            "dry_run": dry_run,
            "historical": asdict(options.historical),
        }
        mark_stage_artifact_written(run, "config.resolve", resolved_config)
        save_hydration_pipeline_run(run)

        if options.vendoring_scaffold:
            write_hydration_artifact(
                run,
                "retrieval",
                {
                    "schema": "tonic-hydration-retrieval-merge",
                    "pipeline_version": run.pipeline_version,
                    "retrieval_bundles": [],
                    "evidence_by_path": [],
                    "note": "P0 vendoring scaffold placeholder",
                },
            )
            append_hydration_llm_transcript_event(
                run,
                stage_id="hydrate_intents.cli",
                event="scaffold",
                note="Vendoring-first hydration CLI scaffold executed before full P1 pipeline wiring.",
            )
            finalize_hydration_pipeline_run(run, "skipped")
            save_hydration_pipeline_run(run)
            payload = {
                "schema": "tonic-intent-hydration",
                "pipeline_version": run.pipeline_version,
                "run_id": run.run_id,
                "repo_root": repo_root,
                "persist_root": run.persist_root,
                "run_root": str(Path(run.artifacts.run_state_path).parent),
                "vector_backend": run.vector_backend,
                "hydration_skipped": True,
                "skip_reason": "not_implemented",
                "tags_added": [],
                "rationale": "Vendoring-first CLI scaffold is ready; full hydration orchestration remains blocked behind remaining P0/P1 tasks.",
                "pipeline_run": asdict(run),
                "metadata": {
                    "cache_key": cache_key.cache_key,
                    "pr_scope_hash": cache_key.pr_list_hash,
                    "runtime_mode": runtime.mode,
                },
            }
            write_hydration_artifact(run, "hydration_result", payload)
            save_hydration_pipeline_run(run)
            return RunHydrateIntentsResult(exit_code=0, payload=payload)

        branch_intent_collection = create_hydration_branch_intent_collection(branch_intents)
        write_hydration_artifact(run, "branch_intents", branch_intent_collection)
        mark_stage_artifact_written(run, "branch_intents.collect", branch_intent_collection)
        save_hydration_pipeline_run(run)

        initial_question_slots = plan_hydration_question_slots(
            repo_root=repo_root,
            branch_intents=branch_intents,
            downstream_task=downstream_task,
            max_questions=min(max_questions, 3),
            scope=scope_label,
            prompt_profile=prompt_profile,
            llm_service=hydration_llm_service,
            on_llm_event=lambda event: append_hydration_llm_transcript_event(
                run,
                stage_id="question_plan.compose",
                event=str(event.get("event", "")),
                provider=str(event.get("provider", "")) or None,
                model=str(event.get("model", "")) or None,
                prompt_template=str(event.get("schemaName", "")) or None,
                request_json=event.get("requestJson"),
                response_json=event.get("responseJson"),
                note=str(event.get("note", "")) or None,
            ),
        )
        question_plan = create_hydration_question_plan(
            downstream_task=downstream_task,
            max_questions=max_questions,
            branch_intent_count=len(branch_intents),
            question_slots=initial_question_slots,
        )
        write_hydration_artifact(run, "question_plan", question_plan)
        mark_stage_artifact_written(run, "question_plan.compose", question_plan)
        save_hydration_pipeline_run(run)

        update_hydration_pipeline_stage(run, "index.sync", status="running")
        save_hydration_pipeline_run(run)
        repository = HydrationRepository(
            repo_root,
            scope_patterns=scope_patterns,
            include_paths=historical_paths,
        )
        indexer = HydrationIndexer(repo_root, runtime_bundle.index, embedder, repository=repository)
        sync_result = indexer.sync(
            vector_backend=runtime_bundle.backend,
            cache_key=cache_key.cache_key,
            pr_scope_hash=cache_key.pr_list_hash,
            normative_commit=(options.env or {}).get("GITHUB_SHA", ""),
            scope=scope_label,
            prompt_profile=prompt_profile,
            dry_run=dry_run,
            historical_since=options.historical.since,
            historical_base_ref=options.historical.base_ref,
            historical_state=options.historical.state,
            reuse_state=not dry_run,
            persist_state=not dry_run,
        )
        mark_stage_artifact_written(run, "index.sync", sync_result)
        save_hydration_pipeline_run(run)

        update_hydration_pipeline_stage(run, "hydrate.cycle", status="running")
        save_hydration_pipeline_run(run)

        class _TranscriptSearchMiddleware:
            def before_tool_call(self, context: object) -> None:
                ctx = context  # type: ignore[assignment]
                append_hydration_llm_transcript_event(
                    run,
                    stage_id="hydrate.cycle",
                    event="tool_call",
                    provider="vendored-search-tools",
                    model=embedder.model_id,
                    request_json={
                        "slot_id": getattr(ctx, "slot_id", ""),
                        "question": getattr(ctx, "question", ""),
                        "tool_id": getattr(ctx, "tool_id", ""),
                        "params": getattr(ctx, "params", {}) or {},
                    },
                )

            def after_tool_call(self, context: object, *, record_count: int, payload: object | None = None) -> None:
                ctx = context  # type: ignore[assignment]
                append_hydration_llm_transcript_event(
                    run,
                    stage_id="hydrate.cycle",
                    event="tool_result",
                    provider="vendored-search-tools",
                    model=embedder.model_id,
                    response_json={
                        "slot_id": getattr(ctx, "slot_id", ""),
                        "tool_id": getattr(ctx, "tool_id", ""),
                        "record_count": record_count,
                        "payload": payload or {},
                    },
                )

            def on_tool_error(self, context: object, error: Exception) -> None:
                ctx = context  # type: ignore[assignment]
                append_hydration_llm_transcript_event(
                    run,
                    stage_id="hydrate.cycle",
                    event="tool_error",
                    provider="vendored-search-tools",
                    model=embedder.model_id,
                    note=f"{getattr(ctx, 'tool_id', '')}: {error}",
                )

        search_middleware = _TranscriptSearchMiddleware()
        max_cycles = 3
        max_total_chunks = max(query_top_k * max_questions * 2, query_top_k)
        seen_question_keys: set[str] = set()
        seen_target_ids: set[str] = set()
        seen_evidence_paths: set[str] = set()
        path_visit_counts: dict[str, int] = {}
        all_question_slots: list[HydrationQuestionSlot] = []
        all_retrieval_bundles: list[HydrationRetrievalBundle] = []
        all_fuzzy_alignment = []
        cycles: list[HydrationCycleRecord] = []
        total_retrieved_chunks = 0
        stop_reason = "max_cycles"

        current_targets = [
            HydrationCycleTarget(
                target_id=f"branch:{intent.intent_id}",
                level="branch",
                label=intent.description,
                source_node_ids=[],
            )
            for intent in branch_intents
        ]

        for cycle_number in range(1, max_cycles + 1):
            remaining_questions = max_questions - len(all_question_slots)
            if remaining_questions <= 0:
                stop_reason = "max_total_questions"
                break
            if cycle_number > 1 and not current_targets:
                stop_reason = "no_new_targets"
                break
            append_hydration_llm_transcript_event(
                run,
                stage_id="hydrate.cycle",
                event="cycle_boundary",
                note=f"cycle={cycle_number};targets={len(current_targets)}",
                request_json={"cycle_number": cycle_number, "targets": [asdict(target) for target in current_targets]},
            )
            planned_slots = (
                initial_question_slots
                if cycle_number == 1
                else plan_hydration_question_slots(
                    repo_root=repo_root,
                    branch_intents=branch_intents,
                    downstream_task=downstream_task,
                    max_questions=min(remaining_questions, 3),
                    scope=scope_label,
                    prompt_profile=prompt_profile,
                    llm_service=hydration_llm_service,
                    hydrated_context=_summarize_targets(current_targets),
                    prior_questions=all_question_slots,
                    on_llm_event=lambda event: append_hydration_llm_transcript_event(
                        run,
                        stage_id="hydrate.cycle",
                        event=str(event.get("event", "")),
                        provider=str(event.get("provider", "")) or None,
                        model=str(event.get("model", "")) or None,
                        prompt_template=str(event.get("schemaName", "")) or None,
                        request_json=event.get("requestJson"),
                        response_json=event.get("responseJson"),
                        note=str(event.get("note", "")) or None,
                    ),
                )
            )
            targeted_slots = _build_targeted_question_slots(
                targets=current_targets,
                cycle_number=cycle_number,
                max_questions=min(remaining_questions, 3),
            )
            cycle_question_slots: list[HydrationQuestionSlot] = []

            def add_question(slot: HydrationQuestionSlot) -> None:
                if len(cycle_question_slots) >= remaining_questions:
                    return
                question_key = _normalize_question_key(slot.question)
                if not question_key or question_key in seen_question_keys:
                    return
                seen_question_keys.add(question_key)
                cycle_question_slots.append(
                    HydrationQuestionSlot(
                        id=f"c{cycle_number}-{slot.id}",
                        question=slot.question,
                        strategy=slot.strategy,
                    )
                )

            for slot in targeted_slots:
                add_question(slot)
            for slot in planned_slots:
                add_question(slot)
            if not cycle_question_slots:
                stop_reason = "no_new_targets"
                break

            cycle_retrieval_bundles: list[HydrationRetrievalBundle] = []
            for slot in cycle_question_slots:
                session = run_agentic_code_search_session(
                    query=slot.question,
                    repository=repository,
                    index=runtime_bundle.index,
                    embedder=embedder,
                    llm_service=hydration_llm_service,
                    on_llm_event=lambda event: append_hydration_llm_transcript_event(
                        run,
                        stage_id="hydrate.cycle",
                        event=str(event.get("event", "")),
                        provider=str(event.get("provider", "")) or None,
                        model=str(event.get("model", "")) or None,
                        prompt_template=str(event.get("schemaName", "")) or None,
                        request_json=event.get("requestJson"),
                        response_json=event.get("responseJson"),
                        note=str(event.get("note", "")) or None,
                    ),
                    middleware=search_middleware,
                    top_k=query_top_k,
                    max_plan_size=5,
                    max_step_iterations=6,
                )
                append_hydration_llm_transcript_event(
                    run,
                    stage_id="hydrate.cycle",
                    event="agentic_session",
                    provider="vendored-agentic-code-search",
                    model=embedder.model_id,
                    response_json={
                        "cycle_number": cycle_number,
                        "slot_id": slot.id,
                        "answer": session.answer,
                        "answer_reason": session.answer_reason,
                        "record_count": len(session.records),
                    },
                )
                merged_hits = session.records[:query_top_k]
                vector_hits = [
                    HydrationRetrievalHit(
                        path=record.file_path,
                        chunk_id=record.chunk_id,
                        score=float(record.score),
                        content=record.code,
                        start_line=record.start_line,
                        end_line=record.end_line,
                        symbol=record.symbol,
                    )
                    for record in merged_hits
                ]
                ast_candidates = build_hydration_ast_candidates(session.records[: max(query_top_k * 2, query_top_k)])
                cycle_retrieval_bundles.append(
                    HydrationRetrievalBundle(
                        slot_id=slot.id,
                        question=slot.question,
                        vector_hits=vector_hits,
                        ast_candidates=ast_candidates,
                    )
                )

            cycle_retrieval_merge = build_hydration_retrieval_merge(cycle_retrieval_bundles)
            cycle_fuzzy_alignment = build_hydration_fuzzy_alignment(
                retrieval_bundles=cycle_retrieval_bundles,
                retrieval_merge=cycle_retrieval_merge,
            )
            new_evidence_count = len(
                [entry for entry in cycle_retrieval_merge.evidence_by_path if entry.path not in seen_evidence_paths]
            )
            for evidence in cycle_retrieval_merge.evidence_by_path:
                seen_evidence_paths.add(evidence.path)
                path_visit_counts[evidence.path] = path_visit_counts.get(evidence.path, 0) + 1
            total_retrieved_chunks += sum(len(bundle.vector_hits) for bundle in cycle_retrieval_bundles)
            next_targets = derive_next_cycle_targets(
                retrieval_merge=cycle_retrieval_merge,
                fuzzy_alignment=cycle_fuzzy_alignment,
                path_visit_counts=path_visit_counts,
                seen_target_ids=seen_target_ids,
                max_targets=8,
            )
            cycle_stop_reason = (
                "max_total_chunks"
                if total_retrieved_chunks >= max_total_chunks
                else "max_cycles"
                if cycle_number >= max_cycles
                else "max_total_questions"
                if len(all_question_slots) + len(cycle_question_slots) >= max_questions
                else "no_new_targets"
                if not next_targets
                else "no_new_evidence"
                if new_evidence_count == 0
                else ""
            )
            cycle_record = build_hydration_cycle_record(
                cycle_number=cycle_number,
                targets=current_targets,
                question_slots=cycle_question_slots,
                retrieval_bundles=cycle_retrieval_bundles,
                retrieval_merge=cycle_retrieval_merge,
                fuzzy_alignment=cycle_fuzzy_alignment,
                stop_reason=cycle_stop_reason,
            )
            cycles.append(cycle_record)
            seen_target_ids.update(target.target_id for target in current_targets)
            all_question_slots.extend(cycle_question_slots)
            all_retrieval_bundles.extend(cycle_retrieval_bundles)
            all_fuzzy_alignment.extend(cycle_fuzzy_alignment)
            append_hydration_llm_transcript_event(
                run,
                stage_id="hydrate.cycle",
                event="target_derivation",
                response_json={
                    "cycle_number": cycle_number,
                    "stop_reason": cycle_stop_reason or None,
                    "next_targets": [asdict(target) for target in next_targets],
                },
            )
            if cycle_stop_reason:
                stop_reason = cycle_stop_reason
                break
            current_targets = next_targets

        hydration_cycle = build_final_hydration_cycle_state(cycles=cycles, stop_reason=stop_reason)
        mark_stage_artifact_written(
            run,
            "code_walk.run",
            {
                "schema": "tonic-hydration-code-walk",
                "pipeline_version": run.pipeline_version,
                "cycle_count": len(cycles),
                "slot_count": len(all_question_slots),
            },
        )
        write_hydration_artifact(run, "hydration_cycle", hydration_cycle)
        write_hydration_artifact(
            run,
            "retrieval",
            {
                "schema": "tonic-hydration-retrieval-stage",
                "pipeline_version": run.pipeline_version,
                "retrieval_bundles": [asdict(bundle) for bundle in all_retrieval_bundles],
            },
        )
        retrieval_merge = build_hydration_retrieval_merge(all_retrieval_bundles)
        write_hydration_artifact(run, "retrieval_merge", retrieval_merge)
        mark_stage_artifact_written(run, "hydrate.cycle", hydration_cycle)
        mark_stage_artifact_written(run, "retrieval.merge", retrieval_merge)
        save_hydration_pipeline_run(run)

        consolidation = build_hydration_metadata_consolidation(branch_intents=branch_intents, cycles=cycles)
        write_hydration_artifact(run, "metadata_consolidation", consolidation)
        save_hydration_pipeline_run(run)

        tags_added, rationale = synthesize_hydration_metadata(
            repo_root=repo_root,
            branch_intents=branch_intents,
            question_slots=all_question_slots,
            metadata_consolidation=consolidation,
            retrieval_bundles=all_retrieval_bundles,
            fuzzy_alignment=all_fuzzy_alignment,
            prompt_profile=prompt_profile,
            llm_service=hydration_llm_service,
            on_llm_event=lambda event: append_hydration_llm_transcript_event(
                run,
                stage_id="metadata.hydrate",
                event=str(event.get("event", "")),
                provider=str(event.get("provider", "")) or None,
                model=str(event.get("model", "")) or None,
                prompt_template=str(event.get("schemaName", "")) or None,
                request_json=event.get("requestJson"),
                response_json=event.get("responseJson"),
                note=str(event.get("note", "")) or None,
            ),
        )
        mark_stage_artifact_written(
            run,
            "metadata.hydrate",
            {"tags_added": [asdict(tag) for tag in tags_added], "rationale": rationale},
        )
        update_hydration_pipeline_stage(run, "llm.transcript", status="completed")
        finalize_hydration_pipeline_run(run, "completed")
        save_hydration_pipeline_run(run)

        payload = {
            "schema": "tonic-intent-hydration",
            "pipeline_version": run.pipeline_version,
            "run_id": run.run_id,
            "repo_root": repo_root,
            "persist_root": run.persist_root,
            "run_root": str(Path(run.artifacts.run_state_path).parent),
            "vector_backend": run.vector_backend,
            "hydration_skipped": False,
            "tags_added": [asdict(tag) for tag in tags_added],
            "rationale": rationale,
            "branch_intents": asdict(branch_intent_collection),
            "question_plan": asdict(question_plan),
            "question_slots": [asdict(slot) for slot in all_question_slots],
            "hydration_cycle": asdict(hydration_cycle),
            "retrieval_bundles": [asdict(bundle) for bundle in all_retrieval_bundles],
            "retrieval_merge": asdict(retrieval_merge),
            "metadata_consolidation": asdict(consolidation),
            "fuzzy_alignment": [asdict(candidate) for candidate in all_fuzzy_alignment],
            "pipeline_run": asdict(run),
            "metadata": {
                "cache_key": cache_key.cache_key,
                "pr_scope_hash": cache_key.pr_list_hash,
                "runtime_mode": runtime.mode,
                "added_files": sync_result.added_files,
                "updated_files": sync_result.updated_files,
                "removed_files": sync_result.removed_files,
                "indexed_chunks": sync_result.indexed_chunks,
                "scope": scope_label,
                "prompt_profile": prompt_profile or "default",
                "dry_run": dry_run,
                "historical_max_prs": options.historical.max_prs,
                "historical_since": options.historical.since,
                "historical_base_ref": options.historical.base_ref,
                "historical_state": options.historical.state,
            },
        }
        write_hydration_artifact(run, "hydration_result", payload)
        mark_stage_artifact_written(run, "emit", payload)
        save_hydration_pipeline_run(run)
        payload["pipeline_run"] = asdict(run)
        return RunHydrateIntentsResult(exit_code=0, payload=payload)
    except Exception as exc:
        update_hydration_pipeline_stage(run, "emit", status="failed", error=str(exc))
        finalize_hydration_pipeline_run(run, "failed")
        save_hydration_pipeline_run(run)
        return RunHydrateIntentsResult(
            exit_code=1,
            payload={
                "ok": False,
                "hydration_skipped": True,
                "skip_reason": "missing_configuration",
                "runtime_mode": runtime.mode,
                "error": str(exc),
            },
        )
    finally:
        if lock is not None:
            lock.release()
