"""compare-three --hydrate-after delegates to cmd_hydrate after a successful run."""

from __future__ import annotations

import subprocess
from pathlib import Path


def test_compare_three_hydrate_after_calls_hydrate(tmp_path: Path, monkeypatch) -> None:
    r = tmp_path / "repo"
    r.mkdir()
    subprocess.run(["git", "init", "-b", "main"], cwd=r, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "a@b.c"], cwd=r, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=r, check=True, capture_output=True)
    (r / "f.txt").write_text("base\n", encoding="utf-8")
    subprocess.run(["git", "add", "f.txt"], cwd=r, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", "b"], cwd=r, check=True, capture_output=True)
    subprocess.run(["git", "checkout", "-b", "left"], cwd=r, check=True, capture_output=True)
    (r / "f.txt").write_text("left\n", encoding="utf-8")
    subprocess.run(["git", "commit", "-am", "l"], cwd=r, check=True, capture_output=True)
    subprocess.run(["git", "checkout", "main"], cwd=r, check=True, capture_output=True)
    subprocess.run(["git", "checkout", "-b", "right"], cwd=r, check=True, capture_output=True)
    (r / "f.txt").write_text("right\n", encoding="utf-8")
    subprocess.run(["git", "commit", "-am", "r"], cwd=r, check=True, capture_output=True)

    seen: list[list[str]] = []

    def fake_hydrate(argv: list[str]) -> int:
        seen.append(list(argv))
        return 0

    monkeypatch.setattr("tonic.hydration_pipeline.cmd_hydrate", fake_hydrate)

    from tonic.git_cli import cmd_git_compare_three

    rc = cmd_git_compare_three(
        str(r),
        left_ref="left",
        right_ref="right",
        dry_run=False,
        hydrate_after=["--phase", "intent-bootstrap"],
    )
    assert rc == 0
    assert len(seen) == 1
    assert "--repo" in seen[0]
    assert str(r.resolve()) in seen[0] or str(r) in seen[0]
    assert "--phase" in seen[0]
    assert "intent-bootstrap" in seen[0]
