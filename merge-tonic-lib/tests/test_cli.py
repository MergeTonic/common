"""CLI parity smoke tests (merge-tonic script)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

FIX = Path(__file__).resolve().parent / "fixtures" / "cli"


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tonic.cli", *args],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def test_merge_stdout_matches_snapshot():
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    cp = _run("merge", "--left", str(left), "--right", str(right))
    out = cp.stdout.strip()
    assert "<<<<<<< begin" in out
    assert ">>>>>>> end conflict" in out


def test_merge_short_flags_work() -> None:
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    cp = _run("m", "-l", str(left), "-r", str(right))
    assert "<<<<<<< begin" in cp.stdout


def test_report_json_schema_shape():
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    cp = _run("report", "--left", str(left), "--right", str(right), "--path", "demo.txt")
    data = json.loads(cp.stdout)
    assert data["schema"] == "merge-tonic-report"
    assert len(data["files"]) == 1
    f0 = data["files"][0]
    assert f0["path"] == "demo.txt"
    assert "markers_present" in f0


def test_report_blame_fields() -> None:
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    cp = _run(
        "report",
        "--left",
        str(left),
        "--right",
        str(right),
        "--path",
        "demo.txt",
        "--blame",
        "--left-commit-id",
        "abc123",
        "--right-commit-id",
        "def456",
    )
    data = json.loads(cp.stdout)
    f0 = data["files"][0]
    assert f0["left_commit_id"] == "abc123"
    assert f0["right_commit_id"] == "def456"
    if f0["conflict_regions"]:
        r0 = f0["conflict_regions"][0]
        assert r0["left_commit_ids"] == ["abc123"]
        assert r0["right_commit_ids"] == ["def456"]


def test_report_positional_files_work() -> None:
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    cp = _run("r", str(left), str(right), "-p", "demo.txt")
    data = json.loads(cp.stdout)
    assert data["schema"] == "merge-tonic-report"


def test_conflicts_parse_empty():
    cp = _run("conflicts", "--file", str(FIX / "left.txt"))
    data = json.loads(cp.stdout)
    assert data["blocks"] == []
    assert data["warnings"] == []


def test_apply_positional_file_works(tmp_path: Path) -> None:
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    merged = _run("merge", "-l", str(left), "-r", str(right)).stdout
    marker = tmp_path / "m.txt"
    marker.write_text(merged, encoding="utf-8")
    cp = _run("a", str(marker))
    data = json.loads(cp.stdout)
    assert "clean_lines" in data


@pytest.mark.skipif(
    subprocess.run(["git", "--version"], capture_output=True).returncode != 0,
    reason="git not available",
)
def test_merge_positional_branch_helper(tmp_path: Path) -> None:
    repo = tmp_path / "r"
    repo.mkdir()
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "t@e.st"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True, capture_output=True)

    (repo / "foo.txt").write_text("A\n", encoding="utf-8")
    subprocess.run(["git", "add", "foo.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "base"], cwd=repo, check=True)

    subprocess.run(["git", "checkout", "-b", "dev"], cwd=repo, check=True, capture_output=True)
    (repo / "foo.txt").write_text("C\n", encoding="utf-8")
    subprocess.run(["git", "add", "foo.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "dev"], cwd=repo, check=True)

    subprocess.run(["git", "checkout", "main"], cwd=repo, check=True, capture_output=True)
    (repo / "foo.txt").write_text("B\n", encoding="utf-8")
    subprocess.run(["git", "add", "foo.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "main"], cwd=repo, check=True)
    subprocess.run(["git", "checkout", "dev"], cwd=repo, check=True, capture_output=True)

    cp = subprocess.run(
        [sys.executable, "-m", "tonic.cli", "merge", "main", "dev", "--repo", str(repo)],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert cp.returncode == 0, cp.stderr
    text = (repo / "foo.txt").read_text(encoding="utf-8")
    assert "<<<<<<< begin" in text
