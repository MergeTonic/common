"""Hydration pipeline early exit when TONIC_CONFLICT_GATE=zero_stop (parity with TS)."""

from __future__ import annotations

import json
import os
from pathlib import Path

from tonic.ast_grep_hydrate import EXIT_PARTIAL
from tonic.hydration.pipeline import run_hydration_pipeline


def test_pipeline_zero_stop_exits_partial_clean_repo(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "README.md").write_text("# clean\n", encoding="utf-8")
    out = tmp_path / "out"
    out.mkdir()

    repo_root = Path(__file__).resolve().parent.parent.parent
    fake_sg = (
        repo_root
        / "packages"
        / "tonic-core"
        / "src"
        / "test"
        / "fixtures"
        / "astGrep"
        / "fake-sg-success.js"
    )
    assert fake_sg.is_file(), f"missing ast-grep fake fixture: {fake_sg}"

    env = {**os.environ, "TONIC_CONFLICT_GATE": "zero_stop"}

    rc = run_hydration_pipeline(
        str(repo),
        str(out),
        env=env,
        left_intent="L",
        right_intent="R",
        ast_argv=["--ast-grep-bin", str(fake_sg)],
        enable_retrieval=False,
        enable_code_walk=False,
    )
    assert rc == EXIT_PARTIAL

    run = json.loads((out / "hydration-run.json").read_text(encoding="utf-8"))
    assert run.get("inputs", {}).get("conflict_gate", {}).get("policy") == "zero_stop"
    assert run.get("inputs", {}).get("conflict_gate", {}).get("action") == "stop"
    assert any(w.get("code") == "conflict_gate_stop" for w in run.get("warnings") or [])

    stages = run.get("pipeline", {}).get("stages") or []
    ids = [s.get("id") for s in stages]
    assert "conflicts" in ids
    boot = next((s for s in stages if s.get("id") == "intent_bootstrap"), None)
    assert boot is not None
    assert boot.get("status") == "skipped"
