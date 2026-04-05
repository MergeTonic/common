"""R2 delta retrieval env flags (TONIC_SKIP_R2_RETRIEVAL, TONIC_R2_RETRIEVAL_TOPK) vs run_retrieval_for_hydrate."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from tonic.hydration.pipeline import run_hydration_pipeline

ROOT = Path(__file__).resolve().parents[1]
FAKE_SG = (
    ROOT.parent
    / "packages"
    / "tonic-core"
    / "src"
    / "test"
    / "fixtures"
    / "astGrep"
    / "fake-sg-success.js"
)


@pytest.fixture
def minimal_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "sample.ts").write_text("// x\n", encoding="utf-8")
    return repo


def _cfg(tmp_path: Path) -> str:
    p = tmp_path / "hydration-config.json"
    p.write_text(
        json.dumps(
            {
                "question_mode": "improver",
                "question_refinement_context": "progressive",
            }
        ),
        encoding="utf-8",
    )
    return str(p)


def _env_no_llm(**extra: str) -> dict[str, str]:
    """Avoid real LLM calls when the host has API keys in the environment."""
    e = {**os.environ, **extra}
    for k in (
        "OPENAI_API_KEY",
        "AZURE_OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
    ):
        e.pop(k, None)
    return e


def test_skip_r2_retrieval_omits_pass2_retrieval_call(
    minimal_repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert FAKE_SG.is_file(), f"missing fake ast-grep: {FAKE_SG}"
    topks: list[int] = []

    def fake_run_retrieval(*, top_k_per_query: int, **kwargs: object) -> list[dict[str, object]]:
        topks.append(int(top_k_per_query))
        return [{"chunk_id": "c", "score": 0.5, "text": "hit", "metadata": {}}]

    monkeypatch.setattr("tonic.hydration.pipeline.run_retrieval_for_hydrate", fake_run_retrieval)

    out = tmp_path / "out"
    out.mkdir()
    env = _env_no_llm(TONIC_SKIP_R2_RETRIEVAL="1")
    rc = run_hydration_pipeline(
        str(minimal_repo),
        str(out),
        env=env,
        hydration_config_path=_cfg(tmp_path),
        left_intent="L",
        right_intent="R",
        ast_argv=["--ast-grep-bin", str(FAKE_SG)],
        enable_retrieval=True,
        enable_code_walk=False,
    )
    assert rc in (0, 13)
    # pre-r1 (default top_k 6) + post-final (8); no middle R2 call
    assert topks == [6, 8], f"expected [6, 8] with TONIC_SKIP_R2_RETRIEVAL=1, got {topks}"


def test_r2_retrieval_topk_env_passed_to_hydrate(
    minimal_repo: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert FAKE_SG.is_file(), f"missing fake ast-grep: {FAKE_SG}"
    topks: list[int] = []

    def fake_run_retrieval(*, top_k_per_query: int, **kwargs: object) -> list[dict[str, object]]:
        topks.append(int(top_k_per_query))
        return [{"chunk_id": "c", "score": 0.5, "text": "hit", "metadata": {}}]

    monkeypatch.setattr("tonic.hydration.pipeline.run_retrieval_for_hydrate", fake_run_retrieval)

    out = tmp_path / "out"
    out.mkdir()
    env = _env_no_llm(TONIC_R2_RETRIEVAL_TOPK="3")
    rc = run_hydration_pipeline(
        str(minimal_repo),
        str(out),
        env=env,
        hydration_config_path=_cfg(tmp_path),
        left_intent="L",
        right_intent="R",
        ast_argv=["--ast-grep-bin", str(FAKE_SG)],
        enable_retrieval=True,
        enable_code_walk=False,
    )
    assert rc in (0, 13)
    # pre-r1 (6) + R2 (3) + post-final (8)
    assert topks == [6, 3, 8], f"expected [6, 3, 8] with TONIC_R2_RETRIEVAL_TOPK=3, got {topks}"
