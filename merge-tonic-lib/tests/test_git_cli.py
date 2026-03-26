"""Smoke tests for merge-tonic git compare (local temp repo)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest


def _run_git_cli(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tonic.cli", "git", "--repo", str(repo), *args],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


@pytest.mark.skipif(
    subprocess.run(["git", "--version"], capture_output=True).returncode != 0,
    reason="git not available",
)
def test_git_compare_same_ref_empty(tmp_path: Path) -> None:
    repo = tmp_path / "r"
    repo.mkdir()
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "t@e.st"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    (repo / "a.txt").write_text("1\n", encoding="utf-8")
    subprocess.run(["git", "add", "a.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "m"], cwd=repo, check=True)
    cp = _run_git_cli(
        repo,
        "compare",
        "--left-ref",
        "HEAD",
        "--right-ref",
        "HEAD",
        "--dry-run",
    )
    assert cp.returncode == 0, cp.stderr
    data = json.loads(cp.stdout)
    assert data["files"] == 0


@pytest.mark.skipif(
    subprocess.run(["git", "--version"], capture_output=True).returncode != 0,
    reason="git not available",
)
def test_git_materialize_after_merge_conflict(tmp_path: Path) -> None:
    repo = tmp_path / "r"
    repo.mkdir()
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "t@e.st"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True, capture_output=True)
    (repo / "foo.txt").write_text("A\n", encoding="utf-8")
    subprocess.run(["git", "add", "foo.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "base"], cwd=repo, check=True)
    subprocess.run(["git", "checkout", "-b", "other"], cwd=repo, check=True, capture_output=True)
    (repo / "foo.txt").write_text("B\n", encoding="utf-8")
    subprocess.run(["git", "add", "foo.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "other"], cwd=repo, check=True)
    subprocess.run(["git", "checkout", "main"], cwd=repo, check=True, capture_output=True)
    (repo / "foo.txt").write_text("C\n", encoding="utf-8")
    subprocess.run(["git", "add", "foo.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "main"], cwd=repo, check=True)
    merge = subprocess.run(["git", "merge", "other"], cwd=repo, capture_output=True, text=True)
    assert merge.returncode != 0
    cp = _run_git_cli(repo, "materialize", "--write")
    assert cp.returncode == 0, cp.stderr
    out = json.loads(cp.stdout)
    assert out["unmerged"] >= 1
    text = (repo / "foo.txt").read_text(encoding="utf-8")
    assert "<<<<<<< begin" in text


@pytest.mark.skipif(
    subprocess.run(["git", "--version"], capture_output=True).returncode != 0,
    reason="git not available",
)
def test_git_from_index_alias(tmp_path: Path) -> None:
    repo = tmp_path / "r"
    repo.mkdir()
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "t@e.st"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True, capture_output=True)
    (repo / "x.txt").write_text("1\n", encoding="utf-8")
    subprocess.run(["git", "add", "x.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "a"], cwd=repo, check=True)
    subprocess.run(["git", "checkout", "-b", "b"], cwd=repo, check=True, capture_output=True)
    (repo / "x.txt").write_text("2\n", encoding="utf-8")
    subprocess.run(["git", "add", "x.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "b"], cwd=repo, check=True)
    subprocess.run(["git", "checkout", "main"], cwd=repo, check=True, capture_output=True)
    (repo / "x.txt").write_text("3\n", encoding="utf-8")
    subprocess.run(["git", "add", "x.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "c"], cwd=repo, check=True)
    subprocess.run(["git", "merge", "b"], cwd=repo, capture_output=True)
    cp = _run_git_cli(repo, "from-index", "--dry-run")
    assert cp.returncode == 0, cp.stderr
    assert json.loads(cp.stdout)["unmerged"] >= 1
