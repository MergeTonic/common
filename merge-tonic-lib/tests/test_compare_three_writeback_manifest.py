"""compare-three --write-weave (text mode) persists manifest + blobs."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


def test_compare_three_text_writeback_writes_manifest(tmp_path: Path) -> None:
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

    from tonic.git_cli import cmd_git_compare_three

    assert (
        cmd_git_compare_three(
            str(r),
            left_ref="left",
            right_ref="right",
            dry_run=False,
            write=True,
            write_weave=True,
            weave_writeback_mode="text",
        )
        == 0
    )

    man = r / ".tonic" / "weave" / "manifest.json"
    assert man.is_file()
    data = json.loads(man.read_text(encoding="utf-8"))
    assert data.get("schema") == "tonic-git-manifest"
    assert "f.txt" in (data.get("paths") or {})
