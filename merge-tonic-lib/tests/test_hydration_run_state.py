from pathlib import Path

from tonic.hydration import (
    HYDRATION_PIPELINE_STAGE_IDS,
    HydrationBranchIntent,
    HydrationQuestionSlot,
    HydrationRetrievalAstCandidate,
    HydrationRetrievalBundle,
    HydrationRetrievalHit,
    append_hydration_llm_transcript_event,
    build_hydration_retrieval_merge,
    create_hydration_branch_intent_collection,
    create_hydration_pipeline_run,
    create_hydration_question_plan,
    load_hydration_pipeline_run,
    mark_stage_artifact_written,
    save_hydration_pipeline_run,
    write_hydration_artifact,
)


def test_hydration_run_state_uses_canonical_stage_order_and_artifacts():
    repo_root = Path("tests/_tmp_run_state")
    repo_root.mkdir(parents=True, exist_ok=True)

    run = create_hydration_pipeline_run(
        repo_root=repo_root,
        vector_backend="memory",
        run_id="run-state-test",
    )
    assert [stage.stage_id for stage in run.stages] == HYDRATION_PIPELINE_STAGE_IDS
    assert run.artifacts.run_state_path.endswith("run-state-test/run-state.json") or run.artifacts.run_state_path.endswith("run-state-test\\run-state.json")

    branch_intents = create_hydration_branch_intent_collection(
        [
            HydrationBranchIntent(
                branch_id="left",
                intent_id="auth-preserve",
                description="Preserve auth flow",
                source_kind="text",
                source_value="keep auth stable",
            )
        ]
    )
    question_plan = create_hydration_question_plan(
        downstream_task="map auth intent",
        max_questions=3,
        branch_intent_count=1,
        question_slots=[
            HydrationQuestionSlot(
                id="q.auth",
                question="Which auth modules are involved?",
                strategy="guided-llm-meta",
            )
        ],
    )
    retrieval_merge = build_hydration_retrieval_merge(
        [
            HydrationRetrievalBundle(
                slot_id="q.auth",
                question="Which auth modules are involved?",
                vector_hits=[
                    HydrationRetrievalHit(
                        path="src/auth.ts",
                        chunk_id="chunk-1",
                        score=0.9,
                        content="auth",
                    )
                ],
                ast_candidates=[
                    HydrationRetrievalAstCandidate(
                        ast_node_id="node-1",
                        path="src/auth.ts",
                        score=0.8,
                    )
                ],
            )
        ]
    )

    write_hydration_artifact(run, "branch_intents", branch_intents)
    write_hydration_artifact(run, "question_plan", question_plan)
    write_hydration_artifact(run, "retrieval", retrieval_merge)
    write_hydration_artifact(run, "retrieval_merge", retrieval_merge)
    write_hydration_artifact(
        run,
        "metadata_consolidation",
        {
            "schema": "tonic-hydration-metadata-consolidation",
            "pipeline_version": "1",
            "paths_ranked": [],
            "symbols_ranked": [],
            "intent_support": [],
            "cycle_deltas": [],
            "candidate_tags": [],
        },
    )
    append_hydration_llm_transcript_event(
        run,
        stage_id="question_plan.compose",
        event="stub",
        note="run-state test",
    )
    mark_stage_artifact_written(run, "question_plan.compose", question_plan)
    save_hydration_pipeline_run(run)

    loaded = load_hydration_pipeline_run(run.artifacts.run_state_path)
    assert loaded is not None
    assert Path(run.artifacts.branch_intents_path).is_file()
    assert Path(run.artifacts.retrieval_path).is_file()
    assert Path(run.artifacts.metadata_consolidation_path).is_file()
    assert Path(run.artifacts.llm_transcript_path).is_file()
    question_plan_stage = [stage for stage in loaded.stages if stage.stage_id == "question_plan.compose"][0]
    assert question_plan_stage.status == "completed"
