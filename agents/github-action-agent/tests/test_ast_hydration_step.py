"""Ast hydration step returns None when disabled."""

from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest

from tonic_agent.ast_hydration_step import _hydration_orchestration_argv_from_env, run_ast_hydration_step

REPO_ROOT = Path(__file__).resolve().parents[3]
FAKE_SG = (
    REPO_ROOT
    / "packages"
    / "tonic-core"
    / "src"
    / "test"
    / "fixtures"
    / "astGrep"
    / "fake-sg-success.js"
)
FAKE_SG_FAIL = FAKE_SG.parent / "fake-sg-fail.js"


def test_run_ast_hydration_step_skipped_when_disabled(monkeypatch) -> None:
    monkeypatch.delenv("INPUT_ENABLE_AST_HYDRATION", raising=False)
    assert run_ast_hydration_step(".") is None


@pytest.mark.skipif(not FAKE_SG.is_file(), reason="TS fake-sg fixture missing")
def test_run_ast_hydration_step_ast_grep_mode_writes_run(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("INPUT_ENABLE_AST_HYDRATION", "1")
    monkeypatch.delenv("INPUT_AST_HYDRATION_SUBCOMMAND", raising=False)
    monkeypatch.setenv("INPUT_AST_HYDRATION_EXTRA_ARGS", f"--ast-grep-bin {FAKE_SG}")
    out = run_ast_hydration_step(str(tmp_path))
    assert out is not None
    assert out.get("mode") == "ast-grep-hydrate"
    run_p = tmp_path / ".tonic" / "hydration-run.json"
    assert run_p.is_file()
    data = json.loads(run_p.read_text(encoding="utf-8"))
    assert data.get("schema") == "tonic-hydration-run"


def test_hydration_orchestration_argv_from_env(monkeypatch) -> None:
    monkeypatch.setenv("INPUT_HYDRATION_USER_QUERY", "why merge")
    monkeypatch.setenv("INPUT_HYDRATION_FOLLOW_UP", "also check tests")
    monkeypatch.setenv("INPUT_HYDRATION_PRIOR_RUN", "/tmp/prior.json")
    assert _hydration_orchestration_argv_from_env() == [
        "--user-query",
        "why merge",
        "--follow-up",
        "also check tests",
        "--prior-run",
        "/tmp/prior.json",
    ]


@pytest.mark.skipif(not FAKE_SG_FAIL.is_file(), reason="fake-sg-fail fixture missing")
def test_run_ast_hydration_step_strict_raises_on_sg_failure(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("INPUT_ENABLE_AST_HYDRATION", "1")
    monkeypatch.delenv("INPUT_AST_HYDRATION_SUBCOMMAND", raising=False)
    monkeypatch.setenv("INPUT_AST_HYDRATION_EXTRA_ARGS", f"--ast-grep-bin {FAKE_SG_FAIL}")
    monkeypatch.setenv("INPUT_AST_HYDRATION_STRICT", "1")
    with pytest.raises(RuntimeError, match=r"ast-grep-hydrate failed with exit 12"):
        run_ast_hydration_step(str(tmp_path))


@pytest.mark.skipif(not FAKE_SG.is_file(), reason="TS fake-sg fixture missing")
def test_run_ast_hydration_step_hydrate_subcommand(tmp_path, monkeypatch) -> None:
    pytest.importorskip("tonic.hydration_pipeline", reason="merge-tonic-lib not installed")
    monkeypatch.setenv("INPUT_ENABLE_AST_HYDRATION", "1")
    monkeypatch.setenv("INPUT_AST_HYDRATION_SUBCOMMAND", "hydrate")
    monkeypatch.setenv("INPUT_AST_HYDRATION_EXTRA_ARGS", f"--ast-grep-bin {FAKE_SG}")
    monkeypatch.setenv("INPUT_INTENT_PAIR", "a,b")
    out = run_ast_hydration_step(str(tmp_path))
    assert out is not None
    assert out.get("mode") == "hydrate"
    assert (tmp_path / ".tonic" / "hydrate-out" / "hydration-run.json").is_file()


@pytest.mark.skipif(not FAKE_SG.is_file(), reason="TS fake-sg fixture missing")
def test_run_ast_hydration_step_hydrate_question_mode_on(tmp_path, monkeypatch) -> None:
    pytest.importorskip("tonic.hydration_pipeline", reason="merge-tonic-lib not installed")
    monkeypatch.setenv("INPUT_ENABLE_AST_HYDRATION", "1")
    monkeypatch.setenv("INPUT_AST_HYDRATION_SUBCOMMAND", "hydrate")
    monkeypatch.setenv("INPUT_HYDRATION_QUESTION_MODE", "on")
    monkeypatch.setenv("INPUT_AST_HYDRATION_EXTRA_ARGS", f"--ast-grep-bin {FAKE_SG}")
    captured: list[list[str]] = []

    def _capture(argv: list[str]) -> int:
        captured.append(list(argv))
        return 0

    with patch("tonic.hydration_pipeline.cmd_hydrate", side_effect=_capture):
        run_ast_hydration_step(str(tmp_path))
    assert captured, "cmd_hydrate should run"
    argv = captured[0]
    i = argv.index("--question-mode")
    assert argv[i + 1] == "on"
