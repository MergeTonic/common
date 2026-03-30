"""Canonical stage order for hydration pipeline runs."""

from __future__ import annotations

from .types import HydrationPipelineStageState

HYDRATION_PIPELINE_STAGE_IDS = [
    "config.resolve",
    "branch_intents.collect",
    "index.sync",
    "question_plan.compose",
    "hydrate.cycle",
    "code_walk.run",
    "retrieval.merge",
    "llm.transcript",
    "metadata.hydrate",
    "emit",
]


def create_default_hydration_pipeline_stages() -> list[HydrationPipelineStageState]:
    return [HydrationPipelineStageState(stage_id=stage_id, status="pending") for stage_id in HYDRATION_PIPELINE_STAGE_IDS]
