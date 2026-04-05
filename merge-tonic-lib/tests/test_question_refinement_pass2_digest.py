"""Pass-2 retrieval JSON participates in context_digest (parity with TS questionRefinement.test)."""

from __future__ import annotations

from tonic.hydration.hydration_config import ResolvedHydrationConfig
from tonic.hydration.question_refinement import run_question_refinement


def test_context_digest_changes_with_pass2_retrieval_json() -> None:
    cfg = ResolvedHydrationConfig(
        question_mode="off",
        refinement_context="minimal",
        strict_llm=False,
        llm_model="gpt-4o-mini",
        llm_base_url="https://api.openai.com/v1",
        openai_api_key_env="OPENAI_API_KEY",
        llm_json_object=True,
    )
    base_kw = dict(
        mode="off",
        config=cfg,
        left_intent="L",
        right_intent="R",
        conflict_regions_json="[]",
        repo_structure_excerpt="src/",
        retrieval_hits_pre_r1_json="[]",
        env={},
    )
    a = run_question_refinement(
        **base_kw,
        retrieval_hits_pass2_json="[]",
    )
    b = run_question_refinement(
        **base_kw,
        retrieval_hits_pass2_json='[{"chunk_id":"c1","score":1,"text":"hit","metadata":{}}]',
    )
    assert a[0] == "ok" and a[1] is not None
    assert b[0] == "ok" and b[1] is not None
    da = a[1].get("context_digest_sha256")
    db = b[1].get("context_digest_sha256")
    assert isinstance(da, str) and len(da) == 64
    assert isinstance(db, str) and len(db) == 64
    assert da != db
