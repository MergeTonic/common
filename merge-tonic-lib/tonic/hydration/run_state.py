"""Run-state persistence and artifact helpers for hydration pipelines."""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from uuid import uuid4

from .paths import resolve_hydration_artifact_paths
from .pipeline_graph import create_default_hydration_pipeline_stages
from .types import (
    HYDRATION_PIPELINE_SCHEMA,
    HYDRATION_PIPELINE_VERSION,
    HydrationBranchIntent,
    HydrationBranchIntentCollection,
    HydrationCycleNode,
    HydrationCycleState,
    HydrationMergedEvidence,
    HydrationPipelineArtifacts,
    HydrationPipelineRun,
    HydrationPipelineStageState,
    HydrationQuestionPlan,
    HydrationQuestionSlot,
    HydrationRetrievalBundle,
    HydrationRetrievalMerge,
    HydrationStageStatus,
    VectorBackendKind,
)

WritableArtifactKey = str

ARTIFACT_FILE_NAMES: dict[WritableArtifactKey, str] = {
    "branch_intents": "branch-intents.json",
    "question_plan": "question-plan.json",
    "hydration_cycle": "hydration-cycle.json",
    "retrieval": "retrieval.json",
    "retrieval_merge": "retrieval-merge.json",
    "metadata_consolidation": "metadata-consolidation.json",
    "hydration_result": "hydration-result.json",
}


def _to_jsonable(value: object) -> object:
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, dict):
        return {str(key): _to_jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_to_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [_to_jsonable(item) for item in value]
    if isinstance(value, set):
        normalized = [_to_jsonable(item) for item in value]
        return sorted(normalized, key=lambda item: json.dumps(item, sort_keys=True))
    return value


def _content_hash_for(value: object) -> str:
    payload = _to_jsonable(value)
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8", errors="replace")).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_hydration_run_id() -> str:
    return str(uuid4())


def resolve_hydration_run_directory(repo_root: str | Path, run_id: str) -> Path:
    return resolve_hydration_artifact_paths(repo_root).run_root / run_id


def create_hydration_pipeline_run(
    *,
    repo_root: str | Path,
    vector_backend: VectorBackendKind,
    run_id: str | None = None,
) -> HydrationPipelineRun:
    artifacts = resolve_hydration_artifact_paths(repo_root)
    resolved_run_id = run_id or default_hydration_run_id()
    run_dir = resolve_hydration_run_directory(repo_root, resolved_run_id)
    return HydrationPipelineRun(
        run_id=resolved_run_id,
        repo_root=str(Path(repo_root).resolve()),
        persist_root=str(artifacts.persist_root),
        vector_backend=vector_backend,
        stages=create_default_hydration_pipeline_stages(),
        artifacts=HydrationPipelineArtifacts(
            index_state_path=str(artifacts.index_state_path),
            run_state_path=str(run_dir / "run-state.json"),
        ),
        run_status="planned",
        pipeline_version=HYDRATION_PIPELINE_VERSION,
        schema=HYDRATION_PIPELINE_SCHEMA,
    )


def save_hydration_pipeline_run(run: HydrationPipelineRun) -> None:
    run_state_path = Path(run.artifacts.run_state_path)
    run_state_path.parent.mkdir(parents=True, exist_ok=True)
    run_state_path.write_text(json.dumps(asdict(run), indent=2) + "\n", encoding="utf-8")


def load_hydration_pipeline_run(path: str | Path) -> HydrationPipelineRun | None:
    file_path = Path(path)
    if not file_path.is_file():
        return None
    data = json.loads(file_path.read_text(encoding="utf-8"))
    stages = [stage for stage in data.get("stages", [])]
    return HydrationPipelineRun(
        run_id=data["run_id"],
        repo_root=data["repo_root"],
        persist_root=data["persist_root"],
        vector_backend=data["vector_backend"],
        run_status=data.get("run_status", "planned"),
        stages=[HydrationPipelineStageState(**stage) for stage in stages],
        artifacts=HydrationPipelineArtifacts(**data["artifacts"]),
        pipeline_version=data.get("pipeline_version", HYDRATION_PIPELINE_VERSION),
        schema=data.get("schema", HYDRATION_PIPELINE_SCHEMA),
    )


def update_hydration_pipeline_stage(
    run: HydrationPipelineRun,
    stage_id: str,
    *,
    status: HydrationStageStatus,
    content_hash: str = "",
    error: str = "",
) -> HydrationPipelineRun:
    updated = []
    for stage in run.stages:
        if stage.stage_id != stage_id:
            updated.append(stage)
            continue
        next_stage = HydrationPipelineStageState(
            stage_id=stage.stage_id,
            status=status,
            content_hash=content_hash or stage.content_hash,
            started_at=stage.started_at or (_now_iso() if status == "running" else ""),
            finished_at=_now_iso() if status != "running" else "",
            error=error or stage.error,
        )
        updated.append(next_stage)
    run.stages = updated
    if status == "running":
        run.run_status = "running"
    elif status == "failed":
        run.run_status = "failed"
    return run


def finalize_hydration_pipeline_run(run: HydrationPipelineRun, status: str) -> HydrationPipelineRun:
    run.run_status = status
    return run


def create_hydration_branch_intent_collection(
    branch_intents: list[HydrationBranchIntent],
) -> HydrationBranchIntentCollection:
    return HydrationBranchIntentCollection(branch_intents=branch_intents)


def create_hydration_question_plan(
    *,
    downstream_task: str,
    max_questions: int,
    branch_intent_count: int,
    question_slots: list[HydrationQuestionSlot],
) -> HydrationQuestionPlan:
    return HydrationQuestionPlan(
        downstream_task=downstream_task,
        max_questions=max_questions,
        branch_intent_count=branch_intent_count,
        question_slots=question_slots,
    )


def create_hydration_cycle_state(
    cycle_number: int,
    nodes: list[HydrationCycleNode],
) -> HydrationCycleState:
    return HydrationCycleState(
        total_cycles=1,
        stop_reason="max_cycles",
        nodes=nodes,
        cycles=[],
    )


def build_hydration_retrieval_merge(
    retrieval_bundles: list[HydrationRetrievalBundle],
) -> HydrationRetrievalMerge:
    by_path: dict[str, dict[str, set[str]]] = {}
    for bundle in retrieval_bundles:
        for hit in bundle.vector_hits:
            entry = by_path.setdefault(hit.path, {"slot_ids": set(), "chunk_ids": set(), "ast_node_ids": set()})
            entry["slot_ids"].add(bundle.slot_id)
            entry["chunk_ids"].add(hit.chunk_id)
        for candidate in bundle.ast_candidates:
            entry = by_path.setdefault(candidate.path, {"slot_ids": set(), "chunk_ids": set(), "ast_node_ids": set()})
            entry["slot_ids"].add(bundle.slot_id)
            entry["ast_node_ids"].add(candidate.ast_node_id)
    evidence_by_path = [
        HydrationMergedEvidence(
            path=file_path,
            slot_ids=sorted(entry["slot_ids"]),
            chunk_ids=sorted(entry["chunk_ids"]),
            ast_node_ids=sorted(entry["ast_node_ids"]),
        )
        for file_path, entry in sorted(by_path.items())
    ]
    return HydrationRetrievalMerge(
        retrieval_bundles=retrieval_bundles,
        evidence_by_path=evidence_by_path,
    )


def write_hydration_artifact(run: HydrationPipelineRun, key: WritableArtifactKey, value: object) -> str:
    target = Path(run.artifacts.run_state_path).parent / ARTIFACT_FILE_NAMES[key]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(_to_jsonable(value), indent=2) + "\n", encoding="utf-8")
    setattr(run.artifacts, f"{key}_path", str(target))
    return str(target)


def mark_stage_artifact_written(run: HydrationPipelineRun, stage_id: str, value: object) -> HydrationPipelineRun:
    payload = _to_jsonable(value)
    return update_hydration_pipeline_stage(run, stage_id, status="completed", content_hash=_content_hash_for(payload))
