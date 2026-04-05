"""Hydrate CLI LLM policy: missing key → partial 13 + warning; --strict-llm → 11."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
FAKE_SG = ROOT / ".." / "packages" / "tonic-core" / "src" / "test" / "fixtures" / "astGrep" / "fake-sg-success.js"


def test_hydrate_phase_unknown_exit_11(tmp_path: Path) -> None:
    out = tmp_path / "out"
    out.mkdir()
    env = {**os.environ, "MERGETONIC_LICENSE_ACCEPTED": "1"}
    cp = _run(
        [
            "hydrate",
            "--repo",
            str(tmp_path),
            "--out-dir",
            str(out),
            "--phase",
            "not-a-real-phase",
            "--left-intent",
            "a",
            "--right-intent",
            "b",
        ],
        env,
        tmp_path,
    )
    assert cp.returncode == 11
    err = (cp.stderr or "").lower()
    assert "unknown" in err and "--phase" in err


def test_hydrate_phase_intent_bootstrap_skips_downstream(tmp_path: Path) -> None:
    out = tmp_path / "out"
    out.mkdir()
    env = {**os.environ, "MERGETONIC_LICENSE_ACCEPTED": "1"}
    cp = _run(
        [
            "hydrate",
            "--repo",
            str(tmp_path),
            "--out-dir",
            str(out),
            "--phase",
            "intent-bootstrap",
            "--question-mode",
            "off",
            "--left-intent",
            "a",
            "--right-intent",
            "b",
        ],
        env,
        tmp_path,
    )
    assert cp.returncode == 0
    run = json.loads((out / "hydration-run.json").read_text(encoding="utf-8"))
    stages = {s["id"]: s["status"] for s in run["pipeline"]["stages"]}
    assert stages.get("conflicts") in ("ok", "skipped")
    assert stages.get("intent_bootstrap") == "ok"
    assert stages.get("question_refinement") == "skipped"


def _run(args: list[str], env: dict[str, str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tonic.cli", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )


@pytest.mark.skipif(not FAKE_SG.is_file(), reason="fake-sg fixture missing")
def test_hydrate_improver_no_api_key_partial_13(tmp_path: Path) -> None:
    (tmp_path / "sample.ts").write_text("// x\n", encoding="utf-8")
    out = tmp_path / "out"
    out.mkdir()
    env = {**os.environ, "MERGETONIC_LICENSE_ACCEPTED": "1"}
    env.pop("OPENAI_API_KEY", None)
    cp = _run(
        [
            "hydrate",
            "--repo",
            str(tmp_path),
            "--out-dir",
            str(out),
            "--left-intent",
            "a",
            "--right-intent",
            "b",
            "--question-mode",
            "improver",
            "--openai-api-key-env",
            "OPENAI_API_KEY",
            "--ast-grep-bin",
            str(FAKE_SG),
        ],
        env,
        tmp_path,
    )
    assert cp.returncode == 13, cp.stderr
    run = json.loads((out / "hydration-run.json").read_text(encoding="utf-8"))
    assert any(w.get("code") == "llm_skipped" for w in run.get("warnings", []))


@pytest.mark.skipif(not FAKE_SG.is_file(), reason="fake-sg fixture missing")
def test_hydrate_improver_strict_llm_exit_11(tmp_path: Path) -> None:
    (tmp_path / "sample.ts").write_text("// x\n", encoding="utf-8")
    out = tmp_path / "out2"
    out.mkdir()
    env = {**os.environ, "MERGETONIC_LICENSE_ACCEPTED": "1"}
    env.pop("OPENAI_API_KEY", None)
    cp = _run(
        [
            "hydrate",
            "--repo",
            str(tmp_path),
            "--out-dir",
            str(out),
            "--left-intent",
            "a",
            "--right-intent",
            "b",
            "--question-mode",
            "improver",
            "--strict-llm",
            "--openai-api-key-env",
            "OPENAI_API_KEY",
            "--ast-grep-bin",
            str(FAKE_SG),
        ],
        env,
        tmp_path,
    )
    assert cp.returncode == 11, cp.stderr
