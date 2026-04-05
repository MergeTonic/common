"""Ast-grep hydrate CLI parity tests (fake binary via Node .js fixtures)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
FAKE_SG = ROOT / ".." / "packages" / "tonic-core" / "src" / "test" / "fixtures" / "astGrep" / "fake-sg-success.js"


def _run_merge_tonic(args: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "MERGETONIC_LICENSE_ACCEPTED": "1"}
    return subprocess.run(
        [sys.executable, "-m", "tonic.cli", *args],
        cwd=cwd or ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )


@pytest.mark.skipif(not FAKE_SG.is_file(), reason="TS fixture fake-sg not present")
def test_ast_grep_hydrate_writes_schemas(tmp_path: Path) -> None:
    (tmp_path / "x.ts").write_text("// hi\n", encoding="utf-8")
    out = tmp_path / "ast.json"
    runp = tmp_path / "run.json"
    cp = _run_merge_tonic(
        [
            "ast-grep-hydrate",
            "--repo",
            str(tmp_path),
            "--out",
            str(out),
            "--run-out",
            str(runp),
            "--ast-grep-bin",
            str(FAKE_SG),
        ],
        cwd=tmp_path,
    )
    assert cp.returncode == 0, cp.stderr
    ast = json.loads(out.read_text(encoding="utf-8"))
    assert ast["schema"] == "tonic-ast-hydration"
    run = json.loads(runp.read_text(encoding="utf-8"))
    assert run["schema"] == "tonic-hydration-run"


def test_missing_binary_exit_10(tmp_path: Path) -> None:
    missing = tmp_path / "nope-sg.exe"
    out = tmp_path / "ast.json"
    runp = tmp_path / "run.json"
    cp = _run_merge_tonic(
        [
            "ast-grep-hydrate",
            "--repo",
            str(tmp_path),
            "--out",
            str(out),
            "--run-out",
            str(runp),
            "--ast-grep-bin",
            str(missing),
        ],
        cwd=tmp_path,
    )
    assert cp.returncode == 10
