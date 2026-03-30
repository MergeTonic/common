"""Vendored multi-step code search session runner (planner/executor/evaluator style)."""

from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
from typing import Callable

from .embedder import Embedder
from .llm_service import HydrationLlmMessage, HydrationLlmService
from .middleware import (
    HydrationSearchMiddleware,
    HydrationToolCallContext,
    run_hydration_tool_with_middleware,
)
from .prompt_bundle import (
    agentic_prompt_section,
    build_code_search_execute_step_user_prompt,
    format_agentic_prompt_template,
)
from .repository import HydrationRepository
from .search_tools import (
    CodeSearchRecord,
    extract_regex_candidates,
    extract_symbol_candidates,
    get_file_content,
    hybrid_search_records,
    list_files,
    merge_search_records,
    regex_search_records,
    symbol_search_records,
)
from .vector_index import VectorIndex

AgenticCodeSearchStepStatus = str
AgenticCodeSearchStepKind = str
AgenticCodeSearchLlmEvent = dict[str, object]


@dataclass
class AgenticCodeSearchStep:
    id: str
    title: str
    description: str
    kind: AgenticCodeSearchStepKind
    status: AgenticCodeSearchStepStatus = "pending"
    parents: list[str] | None = None
    symbol_candidates: list[str] = field(default_factory=list)
    regex_candidates: list[str] = field(default_factory=list)


@dataclass
class AgenticCodeSearchChunk:
    file_path: str
    snippet: str
    relevance: float
    symbol: str = ""


@dataclass
class AgenticCodeSearchOutcome:
    step_id: str
    status: AgenticCodeSearchStepStatus
    summary: str
    chunks: list[AgenticCodeSearchChunk] = field(default_factory=list)
    insights: list[str] = field(default_factory=list)


@dataclass
class AgenticCodeSearchSession:
    query: str
    plan: list[AgenticCodeSearchStep]
    outcomes: list[AgenticCodeSearchOutcome]
    records: list[CodeSearchRecord]
    answer: str
    answer_reason: str = ""


def _to_chunk(record: CodeSearchRecord) -> AgenticCodeSearchChunk:
    snippet = f"{record.code[:400]}..." if len(record.code) > 400 else record.code
    return AgenticCodeSearchChunk(
        file_path=record.file_path,
        snippet=snippet,
        symbol=record.symbol,
        relevance=max(0.0, min(1.0, float(record.score))),
    )


def _make_summary(kind: AgenticCodeSearchStepKind, records: list[CodeSearchRecord], extra: str = "") -> str:
    path_count = len({record.file_path for record in records})
    base = f"{kind} search returned {len(records)} records across {path_count} files."
    return f"{base} {extra}".strip()


def _synthetic_chunk_id(parts: list[str]) -> str:
    digest = hashlib.sha256("\x1e".join(parts).encode("utf-8", errors="replace")).hexdigest()[:16]
    return f"synthetic:{digest}"


def _unique_paths(records: list[CodeSearchRecord]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for record in records:
        if record.file_path in seen:
            continue
        seen.add(record.file_path)
        out.append(record.file_path)
    return out


def _clone_step(step: AgenticCodeSearchStep) -> AgenticCodeSearchStep:
    return AgenticCodeSearchStep(
        id=step.id,
        title=step.title,
        description=step.description,
        kind=step.kind,
        status=step.status,
        parents=list(step.parents) if step.parents else None,
        symbol_candidates=list(step.symbol_candidates),
        regex_candidates=list(step.regex_candidates),
    )


def _build_plan(query: str, *, max_plan_size: int, top_k: int) -> list[AgenticCodeSearchStep]:
    symbol_candidates = extract_symbol_candidates(query, max_candidates=max(1, min(4, top_k)))
    regex_candidates = extract_regex_candidates(query, max_candidates=max(1, min(3, top_k)))
    steps: list[AgenticCodeSearchStep] = [
        AgenticCodeSearchStep(
            id="step-semantic",
            title="Map relevant code with semantic retrieval",
            description="Run semantic retrieval to identify likely entrypoints before targeted searches.",
            kind="semantic",
            parents=None,
        )
    ]
    if symbol_candidates and len(steps) < max_plan_size - 1:
        steps.append(
            AgenticCodeSearchStep(
                id="step-symbol",
                title="Resolve symbol declarations",
                description="Search for direct symbol declarations to improve structural precision.",
                kind="symbol",
                parents=["step-semantic"],
                symbol_candidates=symbol_candidates,
            )
        )
    if regex_candidates and len(steps) < max_plan_size - 1:
        steps.append(
            AgenticCodeSearchStep(
                id="step-regex",
                title="Run lexical/regex confirmation",
                description="Use lexical patterns to verify exact matches for critical phrases.",
                kind="regex",
                parents=["step-semantic"],
                regex_candidates=regex_candidates,
            )
        )
    if len(steps) < max_plan_size - 1:
        steps.append(
            AgenticCodeSearchStep(
                id="step-files",
                title="Read file-level context",
                description="List files and pull direct file context for high-signal paths.",
                kind="list_files",
                parents=[step.id for step in steps],
            )
        )
    steps.append(
        AgenticCodeSearchStep(
            id="step-finalize",
            title="Finalize findings",
            description="Consolidate evidence into a final, code-grounded answer.",
            kind="finalize",
            parents=[step.id for step in steps],
        )
    )
    return steps[:max_plan_size]


def _to_prompt_context(
    query: str,
    plan: list[AgenticCodeSearchStep],
    outcomes: list[AgenticCodeSearchOutcome],
) -> dict[str, object]:
    return {
        "query": query,
        "plan": [
            {
                "id": step.id,
                "title": step.title,
                "description": step.description,
            }
            for step in plan
        ],
        "history": [
            {
                "stepId": outcome.step_id,
                "summary": outcome.summary,
                "chunks": [
                    {
                        "filePath": chunk.file_path,
                        "symbol": chunk.symbol,
                        "snippet": chunk.snippet,
                    }
                    for chunk in outcome.chunks
                ],
                "insights": list(outcome.insights),
            }
            for outcome in outcomes
        ],
    }


def _normalize_plan_steps(raw: object, fallback_max: int) -> list[AgenticCodeSearchStep]:
    if not isinstance(raw, dict):
        return []
    steps_value = raw.get("steps")
    if not isinstance(steps_value, list):
        return []
    out: list[AgenticCodeSearchStep] = []
    known_ids: set[str] = set()
    for index, item in enumerate(steps_value):
        if len(out) >= fallback_max or not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        if not title:
            continue
        description = str(item.get("description", "")).strip() or title
        base_id = str(item.get("id", "")).strip() or f"llm-step-{index + 1}"
        step_id = base_id
        suffix = 1
        while step_id in known_ids:
            suffix += 1
            step_id = f"{base_id}-{suffix}"
        known_ids.add(step_id)
        kind_raw = str(item.get("kind", "")).strip().lower()
        kind = kind_raw if kind_raw in {"semantic", "hybrid", "symbol", "regex", "list_files", "finalize"} else "semantic"
        parents = [str(value).strip() for value in item.get("parents", [])] if isinstance(item.get("parents"), list) else []
        symbol_candidates = (
            [str(value).strip() for value in item.get("symbolCandidates", []) if str(value).strip()]
            if isinstance(item.get("symbolCandidates"), list)
            else []
        )
        regex_candidates = (
            [str(value).strip() for value in item.get("regexCandidates", []) if str(value).strip()]
            if isinstance(item.get("regexCandidates"), list)
            else []
        )
        out.append(
            AgenticCodeSearchStep(
                id=step_id,
                title=title,
                description=description,
                kind=kind,
                parents=parents or None,
                symbol_candidates=symbol_candidates,
                regex_candidates=regex_candidates,
            )
        )
    return out


def _normalize_evaluation(raw: object) -> dict[str, object]:
    if not isinstance(raw, dict):
        return {"decision": "continue", "steps": []}
    decision_raw = str(raw.get("decision", "")).strip().lower()
    decision = decision_raw if decision_raw in {"break", "override"} else "continue"
    override_payload = raw.get("steps")
    if not isinstance(override_payload, list):
        override_payload = raw.get("planOverride")
    return {
        "decision": decision,
        "steps": _normalize_plan_steps({"steps": override_payload}, 6),
    }


def _emit_llm_event(
    on_llm_event: Callable[[AgenticCodeSearchLlmEvent], None] | None,
    *,
    event: str,
    schema_name: str,
    llm_service: HydrationLlmService,
    request_json: object | None = None,
    response_json: object | None = None,
    note: str | None = None,
) -> None:
    if on_llm_event is None:
        return
    payload: AgenticCodeSearchLlmEvent = {
        "event": event,
        "schemaName": schema_name,
        "provider": llm_service.provider_id,
        "model": llm_service.model,
    }
    if request_json is not None:
        payload["requestJson"] = request_json
    if response_json is not None:
        payload["responseJson"] = response_json
    if note:
        payload["note"] = note
    on_llm_event(payload)


def _maybe_generate_plan_with_llm(
    *,
    query: str,
    max_plan_size: int,
    llm_service: HydrationLlmService | None,
    on_llm_event: Callable[[AgenticCodeSearchLlmEvent], None] | None,
) -> list[AgenticCodeSearchStep] | None:
    if llm_service is None:
        return None
    prompts = agentic_prompt_section("code_search")
    system = format_agentic_prompt_template(
        prompts.get("generate_plan", ""),
        initial_plan_size=str(min(4, max_plan_size)),
        max_query_plan_size=str(max_plan_size),
    )
    request_json = {
        "messages": [
            HydrationLlmMessage(role="system", content=system),
            HydrationLlmMessage(role="user", content=query),
        ],
        "schemaName": "hydration_code_search_plan",
        "schemaDescription": (
            '{"steps":[{"id":"string","title":"string","description":"string",'
            '"kind":"semantic|hybrid|symbol|regex|list_files|finalize","parents":["step-id"],'
            '"symbolCandidates":["string"],"regexCandidates":["string"]}]}'
        ),
    }
    _emit_llm_event(
        on_llm_event,
        event="llm_request",
        schema_name=str(request_json["schemaName"]),
        llm_service=llm_service,
        request_json=request_json,
    )
    try:
        response = llm_service.generate_json(
            messages=request_json["messages"],
            schema_name=str(request_json["schemaName"]),
            schema_description=str(request_json["schemaDescription"]),
        )
        _emit_llm_event(
            on_llm_event,
            event="llm_response",
            schema_name=str(request_json["schemaName"]),
            llm_service=llm_service,
            response_json=response,
        )
        steps = _normalize_plan_steps(response, max_plan_size)
        return steps if steps else None
    except Exception as exc:
        _emit_llm_event(
            on_llm_event,
            event="llm_error",
            schema_name=str(request_json["schemaName"]),
            llm_service=llm_service,
            note=str(exc),
        )
        return None


def _maybe_evaluate_plan_with_llm(
    *,
    query: str,
    max_plan_size: int,
    plan: list[AgenticCodeSearchStep],
    outcomes: list[AgenticCodeSearchOutcome],
    llm_service: HydrationLlmService | None,
    on_llm_event: Callable[[AgenticCodeSearchLlmEvent], None] | None,
) -> dict[str, object] | None:
    if llm_service is None:
        return None
    prompts = agentic_prompt_section("code_search")
    system = format_agentic_prompt_template(
        prompts.get("evaluate_plan_system", ""),
        max_new_steps=str(max_plan_size),
    )
    user = build_code_search_execute_step_user_prompt(
        context=_to_prompt_context(query, plan, outcomes)
    )
    request_json = {
        "messages": [
            HydrationLlmMessage(role="system", content=system),
            HydrationLlmMessage(role="user", content=user),
        ],
        "schemaName": "hydration_code_search_evaluation",
        "schemaDescription": (
            '{"decision":"continue|break|override","steps":[{"id":"string","title":"string","description":"string",'
            '"kind":"semantic|hybrid|symbol|regex|list_files|finalize","parents":["step-id"],'
            '"symbolCandidates":["string"],"regexCandidates":["string"]}]}'
        ),
    }
    _emit_llm_event(
        on_llm_event,
        event="llm_request",
        schema_name=str(request_json["schemaName"]),
        llm_service=llm_service,
        request_json=request_json,
    )
    try:
        response = llm_service.generate_json(
            messages=request_json["messages"],
            schema_name=str(request_json["schemaName"]),
            schema_description=str(request_json["schemaDescription"]),
        )
        _emit_llm_event(
            on_llm_event,
            event="llm_response",
            schema_name=str(request_json["schemaName"]),
            llm_service=llm_service,
            response_json=response,
        )
        return _normalize_evaluation(response)
    except Exception as exc:
        _emit_llm_event(
            on_llm_event,
            event="llm_error",
            schema_name=str(request_json["schemaName"]),
            llm_service=llm_service,
            note=str(exc),
        )
        return None


def _maybe_synthesize_answer_with_llm(
    *,
    query: str,
    plan: list[AgenticCodeSearchStep],
    outcomes: list[AgenticCodeSearchOutcome],
    llm_service: HydrationLlmService | None,
    on_llm_event: Callable[[AgenticCodeSearchLlmEvent], None] | None,
) -> dict[str, str] | None:
    if llm_service is None:
        return None
    prompts = agentic_prompt_section("code_search")
    user = build_code_search_execute_step_user_prompt(
        context=_to_prompt_context(query, plan, outcomes)
    )
    request_json = {
        "messages": [
            HydrationLlmMessage(role="system", content=prompts.get("final_answer_system", "")),
            HydrationLlmMessage(role="user", content=user),
        ],
        "schemaName": "hydration_code_search_final_answer",
        "schemaDescription": '{"answer":"string","reason":"string"}',
    }
    _emit_llm_event(
        on_llm_event,
        event="llm_request",
        schema_name=str(request_json["schemaName"]),
        llm_service=llm_service,
        request_json=request_json,
    )
    try:
        response = llm_service.generate_json(
            messages=request_json["messages"],
            schema_name=str(request_json["schemaName"]),
            schema_description=str(request_json["schemaDescription"]),
        )
        _emit_llm_event(
            on_llm_event,
            event="llm_response",
            schema_name=str(request_json["schemaName"]),
            llm_service=llm_service,
            response_json=response,
        )
        if not isinstance(response, dict):
            return None
        answer = str(response.get("answer", "")).strip()
        reason = str(response.get("reason", "")).strip()
        return {"answer": answer, "reason": reason} if answer else None
    except Exception as exc:
        _emit_llm_event(
            on_llm_event,
            event="llm_error",
            schema_name=str(request_json["schemaName"]),
            llm_service=llm_service,
            note=str(exc),
        )
        return None


def _append_override_plan_steps(*, plan: list[AgenticCodeSearchStep], steps: list[AgenticCodeSearchStep]) -> None:
    used_ids = {step.id for step in plan}
    for raw_step in steps:
        next_id = raw_step.id
        suffix = 1
        while next_id in used_ids:
            suffix += 1
            next_id = f"{raw_step.id}-{suffix}"
        used_ids.add(next_id)
        step = _clone_step(raw_step)
        step.id = next_id
        step.status = "pending"
        plan.append(step)


def _execute_semantic_step(
    *,
    step: AgenticCodeSearchStep,
    query: str,
    top_k: int,
    repository: HydrationRepository,
    index: VectorIndex,
    embedder: Embedder,
    middleware: HydrationSearchMiddleware | None,
) -> tuple[list[CodeSearchRecord], AgenticCodeSearchOutcome]:
    records = run_hydration_tool_with_middleware(
        middleware=middleware,
        context=HydrationToolCallContext(
            slot_id=step.id,
            question=query,
            tool_id="hybrid_search",
            params={
                "dense_query": query,
                "sparse_query": query,
                "dense_weight": 2.0,
                "sparse_weight": 1.0,
                "num_results": top_k,
            },
        ),
        runner=lambda: hybrid_search_records(
            index=index,
            embedder=embedder,
            repository=repository,
            dense_query=query,
            sparse_query=query,
            dense_weight=2.0,
            sparse_weight=1.0,
            num_results=top_k,
        ),
        summarize=lambda result: (len(result), None),
    )
    status = "success" if records else "failure"
    return records, AgenticCodeSearchOutcome(
        step_id=step.id,
        status=status,
        summary=_make_summary("hybrid", records),
        chunks=[_to_chunk(record) for record in records[:top_k]],
        insights=["Hybrid retrieval produced initial candidate files."] if records else ["No hybrid hits found."],
    )


def _execute_symbol_step(
    *,
    step: AgenticCodeSearchStep,
    query: str,
    top_k: int,
    repository: HydrationRepository,
    middleware: HydrationSearchMiddleware | None,
) -> tuple[list[CodeSearchRecord], AgenticCodeSearchOutcome]:
    records_flat: list[CodeSearchRecord] = []
    for symbol_name in step.symbol_candidates:
        records = run_hydration_tool_with_middleware(
            middleware=middleware,
            context=HydrationToolCallContext(
                slot_id=step.id,
                question=query,
                tool_id="symbol_search",
                params={"symbol_name": symbol_name, "num_results": top_k},
            ),
            runner=lambda name=symbol_name: symbol_search_records(
                repository=repository,
                symbol_name=name,
                num_results=top_k,
            ),
            summarize=lambda result: (len(result), None),
        )
        records_flat.extend(records)
    merged = merge_search_records(records_flat, top_k)
    status = "success" if merged else "failure"
    return merged, AgenticCodeSearchOutcome(
        step_id=step.id,
        status=status,
        summary=_make_summary("symbol", merged, f"Symbols: {', '.join(step.symbol_candidates)}" if step.symbol_candidates else ""),
        chunks=[_to_chunk(record) for record in merged[:top_k]],
        insights=["Symbol retrieval narrowed evidence to declaration-level spans."] if merged else ["No symbol declaration matched extracted candidates."],
    )


def _execute_regex_step(
    *,
    step: AgenticCodeSearchStep,
    query: str,
    top_k: int,
    repository: HydrationRepository,
    middleware: HydrationSearchMiddleware | None,
) -> tuple[list[CodeSearchRecord], AgenticCodeSearchOutcome]:
    records_flat: list[CodeSearchRecord] = []
    for pattern in step.regex_candidates:
        records = run_hydration_tool_with_middleware(
            middleware=middleware,
            context=HydrationToolCallContext(
                slot_id=step.id,
                question=query,
                tool_id="regex_search",
                params={"pattern": pattern, "num_results": top_k},
            ),
            runner=lambda p=pattern: regex_search_records(
                repository=repository,
                pattern=p,
                num_results=top_k,
            ),
            summarize=lambda result: (len(result), None),
        )
        records_flat.extend(records)
    merged = merge_search_records(records_flat, top_k)
    status = "success" if merged else "failure"
    return merged, AgenticCodeSearchOutcome(
        step_id=step.id,
        status=status,
        summary=_make_summary("regex", merged, f"Patterns: {', '.join(step.regex_candidates)}" if step.regex_candidates else ""),
        chunks=[_to_chunk(record) for record in merged[:top_k]],
        insights=["Regex retrieval confirmed lexical alignment for candidate code."] if merged else ["No lexical matches found for extracted patterns."],
    )


def _execute_list_files_step(
    *,
    step: AgenticCodeSearchStep,
    query: str,
    top_k: int,
    repository: HydrationRepository,
    middleware: HydrationSearchMiddleware | None,
    existing_records: list[CodeSearchRecord],
) -> tuple[list[CodeSearchRecord], AgenticCodeSearchOutcome]:
    files = run_hydration_tool_with_middleware(
        middleware=middleware,
        context=HydrationToolCallContext(
            slot_id=step.id,
            question=query,
            tool_id="list_files",
            params={"max_files": 2000},
        ),
        runner=lambda: list_files(repository=repository, max_files=2000),
        summarize=lambda result: (len(result), None),
    )
    prioritized = [path for path in _unique_paths(existing_records) if path in files]
    fallback = files[: max(1, min(top_k, 5))]
    selected_paths = (prioritized if prioritized else fallback)[: max(1, min(top_k, 5))]

    records: list[CodeSearchRecord] = []
    for file_path in selected_paths:
        content = run_hydration_tool_with_middleware(
            middleware=middleware,
            context=HydrationToolCallContext(
                slot_id=step.id,
                question=query,
                tool_id="get_file",
                params={"file_path": file_path},
            ),
            runner=lambda p=file_path: get_file_content(repository=repository, file_path=p),
            summarize=lambda _result: (1, None),
        )
        if not content:
            continue
        excerpt = "\n".join(content.splitlines()[:60])
        records.append(
            CodeSearchRecord(
                code=excerpt,
                file_path=file_path,
                chunk_id=_synthetic_chunk_id([step.id, file_path]),
                source="semantic",
                score=0.45,
                start_line=1,
                end_line=max(1, excerpt.count("\n") + 1),
            )
        )

    status = "success" if records else "failure"
    return records, AgenticCodeSearchOutcome(
        step_id=step.id,
        status=status,
        summary=_make_summary("list_files", records, f"Selected {len(selected_paths)} files from repository tree."),
        chunks=[_to_chunk(record) for record in records],
        insights=[f"Repository file inventory considered {len(files)} indexable paths."],
    )


def _execute_finalize_step(
    *,
    step: AgenticCodeSearchStep,
    top_k: int,
    records: list[CodeSearchRecord],
) -> tuple[list[CodeSearchRecord], AgenticCodeSearchOutcome]:
    merged = merge_search_records(records, top_k)
    paths = _unique_paths(merged)
    summary = (
        f"Finalized with {len(merged)} prioritized chunks across {len(paths)} files."
        if merged
        else "Finalized without concrete retrieval evidence."
    )
    return [], AgenticCodeSearchOutcome(
        step_id=step.id,
        status="success" if merged else "failure",
        summary=summary,
        chunks=[_to_chunk(record) for record in merged[:top_k]],
        insights=[f"High-signal files: {', '.join(paths[:5])}"] if merged else ["No final evidence to synthesize."],
    )


def _compose_answer(query: str, records: list[CodeSearchRecord]) -> str:
    if not records:
        return f"No relevant code evidence was found for: {query}"
    merged = merge_search_records(records, 5)
    paths = _unique_paths(merged)[:5]
    symbols = [record.symbol for record in merged if record.symbol]
    symbol_text = f" Symbols: {', '.join(list(dict.fromkeys(symbols))[:8])}." if symbols else ""
    return f"Evidence points to {', '.join(paths)}.{symbol_text}"


def run_agentic_code_search_session(
    *,
    query: str,
    repository: HydrationRepository,
    index: VectorIndex,
    embedder: Embedder,
    llm_service: HydrationLlmService | None = None,
    on_llm_event: Callable[[AgenticCodeSearchLlmEvent], None] | None = None,
    middleware: HydrationSearchMiddleware | None = None,
    top_k: int = 5,
    max_plan_size: int = 5,
    max_step_iterations: int = 5,
) -> AgenticCodeSearchSession:
    safe_top_k = max(1, int(top_k))
    safe_max_plan = max(2, int(max_plan_size))
    safe_max_iters = max(1, int(max_step_iterations))
    initial_plan = _maybe_generate_plan_with_llm(
        query=query,
        max_plan_size=safe_max_plan,
        llm_service=llm_service,
        on_llm_event=on_llm_event,
    ) or _build_plan(query, max_plan_size=safe_max_plan, top_k=safe_top_k)
    plan = [_clone_step(step) for step in initial_plan]
    outcomes: list[AgenticCodeSearchOutcome] = []
    collected_records: list[CodeSearchRecord] = []

    def completed(status: AgenticCodeSearchStepStatus) -> bool:
        return status in {"success", "failure", "cancelled", "timeout"}

    iterations = 0
    stop_requested = False
    while iterations < safe_max_iters and not stop_requested:
        ready = [
            step
            for step in plan
            if step.status == "pending"
            and (
                not step.parents
                or all(
                    completed(next((candidate.status for candidate in plan if candidate.id == parent_id), "pending"))
                    for parent_id in step.parents
                )
            )
        ]
        if not ready:
            break

        for step in ready:
            step.status = "in_progress"
            if step.kind in {"semantic", "hybrid"}:
                records, outcome = _execute_semantic_step(
                    step=step,
                    query=query,
                    top_k=safe_top_k,
                    repository=repository,
                    index=index,
                    embedder=embedder,
                    middleware=middleware,
                )
            elif step.kind == "symbol":
                records, outcome = _execute_symbol_step(
                    step=step,
                    query=query,
                    top_k=safe_top_k,
                    repository=repository,
                    middleware=middleware,
                )
            elif step.kind == "regex":
                records, outcome = _execute_regex_step(
                    step=step,
                    query=query,
                    top_k=safe_top_k,
                    repository=repository,
                    middleware=middleware,
                )
            elif step.kind == "list_files":
                records, outcome = _execute_list_files_step(
                    step=step,
                    query=query,
                    top_k=safe_top_k,
                    repository=repository,
                    middleware=middleware,
                    existing_records=collected_records,
                )
            elif step.kind == "finalize":
                records, outcome = _execute_finalize_step(
                    step=step,
                    top_k=safe_top_k,
                    records=collected_records,
                )
            else:
                records = []
                outcome = AgenticCodeSearchOutcome(
                    step_id=step.id,
                    status="failure",
                    summary=f"Unhandled step kind: {step.kind}",
                )

            step.status = outcome.status
            collected_records.extend(records)
            outcomes.append(outcome)

        evaluation = _maybe_evaluate_plan_with_llm(
            query=query,
            max_plan_size=safe_max_plan,
            plan=plan,
            outcomes=outcomes,
            llm_service=llm_service,
            on_llm_event=on_llm_event,
        )
        if evaluation and evaluation.get("decision") == "break":
            stop_requested = True
        elif evaluation and evaluation.get("decision") == "override":
            override_steps = evaluation.get("steps")
            if isinstance(override_steps, list) and override_steps:
                for step in plan:
                    if step.status in {"pending", "in_progress"}:
                        step.status = "cancelled"
                _append_override_plan_steps(
                    plan=plan,
                    steps=[step for step in override_steps if isinstance(step, AgenticCodeSearchStep)],
                )

        iterations += 1

    if not stop_requested and iterations >= safe_max_iters:
        for step in plan:
            if step.status in {"pending", "in_progress"}:
                step.status = "timeout"
                outcomes.append(
                    AgenticCodeSearchOutcome(
                        step_id=step.id,
                        status="timeout",
                        summary="Step timed out before execution could complete.",
                    )
                )
    else:
        for step in plan:
            if step.status in {"pending", "in_progress"}:
                step.status = "cancelled"

    records = merge_search_records(collected_records, max(safe_top_k, safe_top_k * 2))
    synthesized = _maybe_synthesize_answer_with_llm(
        query=query,
        plan=plan,
        outcomes=outcomes,
        llm_service=llm_service,
        on_llm_event=on_llm_event,
    )
    return AgenticCodeSearchSession(
        query=query,
        plan=plan,
        outcomes=outcomes,
        records=records,
        answer=synthesized["answer"] if synthesized else _compose_answer(query, records),
        answer_reason=(synthesized or {}).get("reason", ""),
    )
