"""Shared hydration contracts for the staged intent-enrichment pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

HYDRATION_INTENT_RESULT_SCHEMA = "tonic-intent-hydration"
HYDRATION_PIPELINE_SCHEMA = "tonic-hydration-pipeline"
HYDRATION_PIPELINE_VERSION = "1"
HYDRATION_OPTIONAL_AI_EXIT_CODE = 5

VectorBackendKind = Literal["chroma-http", "chroma-persistent", "ephemeral", "memory"]
HydrationAstNodeKind = Literal["module", "class", "function", "method", "span"]


@dataclass
class HydrationIntentTag:
    key: str
    value: str
    display: str = ""


@dataclass
class HydrationQuestionSlot:
    id: str
    question: str
    strategy: Literal["guided-llm-meta", "template"] = "guided-llm-meta"


@dataclass
class HydrationBranchIntent:
    branch_id: str
    intent_id: str
    description: str
    source_kind: Literal["text", "file"]
    source_value: str
    priority: Literal["high", "medium", "low"] | None = None
    scope: str = ""


@dataclass
class HydrationBranchIntentCollection:
    branch_intents: list[HydrationBranchIntent] = field(default_factory=list)
    pipeline_version: str = HYDRATION_PIPELINE_VERSION
    schema: str = "tonic-branch-intents"


@dataclass
class HydrationQuestionPlan:
    downstream_task: str
    max_questions: int
    branch_intent_count: int
    question_slots: list[HydrationQuestionSlot] = field(default_factory=list)
    pipeline_version: str = HYDRATION_PIPELINE_VERSION
    schema: str = "tonic-hydration-question-plan"


@dataclass
class HydrationRetrievalHit:
    path: str
    chunk_id: str
    score: float
    content: str
    start_line: int | None = None
    end_line: int | None = None
    symbol: str = ""


@dataclass
class HydrationRetrievalAstCandidate:
    ast_node_id: str
    path: str
    score: float
    rule_id: str = ""
    node_kind: HydrationAstNodeKind | None = None
    symbol: str = ""
    start_line: int | None = None
    end_line: int | None = None


@dataclass
class HydrationRetrievalBundle:
    slot_id: str
    question: str
    vector_hits: list[HydrationRetrievalHit] = field(default_factory=list)
    ast_candidates: list[HydrationRetrievalAstCandidate] = field(default_factory=list)


@dataclass
class HydrationFuzzyAlignmentCandidate:
    ast_node_id: str
    path: str
    score: float
    overlap_score: float | None = None
    token_score: float | None = None
    path_distance_score: float | None = None


@dataclass
class HydrationCycleNode:
    node_id: str
    level: Literal["branch", "dependency", "module", "class", "function", "method", "span"]
    label: str
    source_slot_ids: list[str]
    status: Literal["planned", "hydrated", "skipped"]
    path: str = ""
    symbol: str = ""


@dataclass
class HydrationCycleTarget:
    target_id: str
    level: Literal["branch", "dependency", "module", "class", "function", "method", "span"]
    label: str
    source_node_ids: list[str] = field(default_factory=list)
    path: str = ""
    symbol: str = ""


@dataclass
class HydrationCycleRecord:
    cycle_number: int
    targets: list[HydrationCycleTarget] = field(default_factory=list)
    question_slots: list[HydrationQuestionSlot] = field(default_factory=list)
    retrieval_bundles: list[HydrationRetrievalBundle] = field(default_factory=list)
    retrieval_merge: "HydrationRetrievalMerge | None" = None
    fuzzy_alignment: list[HydrationFuzzyAlignmentCandidate] = field(default_factory=list)
    nodes_added: list[HydrationCycleNode] = field(default_factory=list)
    stop_reason: str = ""


@dataclass
class HydrationCycleState:
    total_cycles: int
    stop_reason: Literal["no_new_targets", "no_new_evidence", "max_cycles", "max_total_questions", "max_total_chunks"]
    nodes: list[HydrationCycleNode] = field(default_factory=list)
    cycles: list[HydrationCycleRecord] = field(default_factory=list)
    pipeline_version: str = HYDRATION_PIPELINE_VERSION
    schema: str = "tonic-hydration-cycle"


@dataclass
class HydrationMergedEvidence:
    path: str
    slot_ids: list[str] = field(default_factory=list)
    chunk_ids: list[str] = field(default_factory=list)
    ast_node_ids: list[str] = field(default_factory=list)


@dataclass
class HydrationRetrievalMerge:
    retrieval_bundles: list[HydrationRetrievalBundle] = field(default_factory=list)
    evidence_by_path: list[HydrationMergedEvidence] = field(default_factory=list)
    pipeline_version: str = HYDRATION_PIPELINE_VERSION
    schema: str = "tonic-hydration-retrieval-merge"


@dataclass
class HydrationConsolidatedPath:
    path: str
    support: int
    slot_support: int
    chunk_support: int
    cycle_support: int
    novelty_score: float


@dataclass
class HydrationConsolidatedSymbol:
    symbol: str
    path: str
    support: int
    avg_score: float


@dataclass
class HydrationIntentSupport:
    intent_id: str
    description: str
    support_paths: list[str] = field(default_factory=list)
    support_symbols: list[str] = field(default_factory=list)
    support_score: int = 0


@dataclass
class HydrationCycleDelta:
    cycle_number: int
    new_paths: list[str] = field(default_factory=list)
    repeated_paths: list[str] = field(default_factory=list)
    new_symbols: list[str] = field(default_factory=list)
    repeated_symbols: list[str] = field(default_factory=list)
    novelty_ratio: float = 0.0


@dataclass
class HydrationCandidateTag:
    key: str
    value: str
    support: int
    confidence: Literal["high", "medium", "low"]


@dataclass
class HydrationMetadataConsolidation:
    paths_ranked: list[HydrationConsolidatedPath] = field(default_factory=list)
    symbols_ranked: list[HydrationConsolidatedSymbol] = field(default_factory=list)
    intent_support: list[HydrationIntentSupport] = field(default_factory=list)
    cycle_deltas: list[HydrationCycleDelta] = field(default_factory=list)
    candidate_tags: list[HydrationCandidateTag] = field(default_factory=list)
    pipeline_version: str = HYDRATION_PIPELINE_VERSION
    schema: str = "tonic-hydration-metadata-consolidation"


HydrationStageStatus = Literal["pending", "running", "completed", "skipped", "failed"]


@dataclass
class HydrationPipelineStageState:
    stage_id: str
    status: HydrationStageStatus
    content_hash: str = ""
    started_at: str = ""
    finished_at: str = ""
    error: str = ""


@dataclass
class HydrationPipelineArtifacts:
    index_state_path: str
    run_state_path: str
    branch_intents_path: str = ""
    question_plan_path: str = ""
    hydration_cycle_path: str = ""
    retrieval_path: str = ""
    retrieval_merge_path: str = ""
    metadata_consolidation_path: str = ""
    hydration_result_path: str = ""
    llm_transcript_path: str = ""


@dataclass
class HydrationPipelineRun:
    run_id: str
    repo_root: str
    persist_root: str
    vector_backend: VectorBackendKind
    stages: list[HydrationPipelineStageState]
    artifacts: HydrationPipelineArtifacts
    run_status: Literal["planned", "running", "completed", "skipped", "failed"] = "planned"
    pipeline_version: str = HYDRATION_PIPELINE_VERSION
    schema: str = HYDRATION_PIPELINE_SCHEMA


@dataclass
class HydrationRunResult:
    run_id: str
    repo_root: str
    persist_root: str
    run_root: str
    vector_backend: VectorBackendKind
    hydration_skipped: bool
    tags_added: list[HydrationIntentTag] = field(default_factory=list)
    pipeline_version: str = HYDRATION_PIPELINE_VERSION
    schema: str = HYDRATION_INTENT_RESULT_SCHEMA
    skip_reason: str = ""
    rationale: str = ""
    branch_intents: HydrationBranchIntentCollection | None = None
    question_plan: HydrationQuestionPlan | None = None
    question_slots: list[HydrationQuestionSlot] = field(default_factory=list)
    hydration_cycle: HydrationCycleState | None = None
    retrieval_bundles: list[HydrationRetrievalBundle] = field(default_factory=list)
    retrieval_merge: HydrationRetrievalMerge | None = None
    metadata_consolidation: HydrationMetadataConsolidation | None = None
    fuzzy_alignment: list[HydrationFuzzyAlignmentCandidate] = field(default_factory=list)
    pipeline_run: HydrationPipelineRun | None = None
    metadata: dict[str, str | int | float | bool | None] = field(default_factory=dict)
