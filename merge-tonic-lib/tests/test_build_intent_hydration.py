"""Golden-style checks for tonic-intent-hydration builder."""

from __future__ import annotations

from tonic.hydration.build_intent_hydration import build_intent_hydration


def test_build_intent_hydration_picks_refined_intents() -> None:
    boot = {
        "left_intent": "a",
        "right_intent": "b",
    }
    refine = {
        "mode": "improver",
        "refined_left_intent": "A",
        "refined_right_intent": "B",
    }
    out = build_intent_hydration(bootstrap=boot, refinement=refine, conflicts=None, ast=None)
    assert out["left_intent"] == "A"
    assert out["right_intent"] == "B"
    assert out["schema"] == "tonic-intent-hydration"


def test_build_intent_hydration_links_conflicts_and_ast() -> None:
    boot = {"left_intent": "L", "right_intent": "R"}
    conflicts = {
        "conflict_regions": [
            {"path": "x.ts", "region_id": "r1", "start_line": 1, "mid_line": 2, "end_line": 3},
        ],
    }
    ast = {
        "matches": [
            {
                "path": "x.ts",
                "rule_id": "todo",
                "start": {"line": 2, "column": 1},
                "end": {"line": 2, "column": 5},
            }
        ]
    }
    out = build_intent_hydration(bootstrap=boot, refinement=None, conflicts=conflicts, ast=ast)
    types = {x["type"] for x in out["evidence_links"]}
    assert "conflict" in types
    assert "ast_match" in types
    assert "r1" in (out.get("conflict_region_ids") or [])


def test_build_intent_hydration_retrieval_and_code_walk_links() -> None:
    boot = {"left_intent": "L", "right_intent": "R"}
    retrieval = {
        "hits": [
            {
                "chunk_id": "c1",
                "text": "t",
                "score": 0.9,
                "metadata": {"path": "p.ts", "start_line": 1, "end_line": 2},
            }
        ]
    }
    out = build_intent_hydration(
        bootstrap=boot,
        refinement=None,
        conflicts=None,
        ast=None,
        retrieval=retrieval,
        code_walk_trace_path="/tmp/trace.json",
    )
    types = {x["type"] for x in out["evidence_links"]}
    assert "retrieval_hit" in types
    assert "code_walk" in types
