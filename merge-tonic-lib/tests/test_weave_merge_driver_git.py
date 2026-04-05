from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

from tonic import initial_state, update_state
from tonic.weave_git.manifest import path_entry_for_file
from tonic.weave_git.replay import state_hash


def _run_git(args: list[str], cwd: Path, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, **(env or {})},
    )


def _merge_driver_command_line() -> str:
    """Build merge.driver for Git's shell (POSIX sh on all platforms Git supports).

    Git for Windows invokes external merge drivers via MSYS ``sh``, not ``cmd.exe``;
    use a forward-slash interpreter path and POSIX shell quoting (``shlex.quote``).
    """
    exe_posix = Path(sys.executable).resolve().as_posix()
    quoted_exe = shlex.quote(exe_posix)
    return f"{quoted_exe} -m tonic.weave_git.git_merge_driver %O %A %B"


def test_git_merge_invokes_tonic_merge_driver(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    st_dir = tmp_path / "states"
    repo.mkdir()
    st_dir.mkdir()

    base_lines = ["line"]
    sb = initial_state(base_lines)
    so = update_state(sb, ["line", "o"], commit_id="c1")
    st = update_state(sb, ["line", "t"], commit_id="c2")
    (st_dir / "base.state").write_text(sb, encoding="utf-8")
    # Merging `left` into `right`: ours = right tip (`st`), theirs = left tip (`so`).
    (st_dir / "ours.state").write_text(st, encoding="utf-8")
    (st_dir / "theirs.state").write_text(so, encoding="utf-8")

    _run_git(["init"], cwd=repo)
    _run_git(["config", "user.email", "t@e"], cwd=repo)
    _run_git(["config", "user.name", "t"], cwd=repo)
    driver_line = _merge_driver_command_line()
    _run_git(["config", "merge.tonic-weave.name", "tonic weave"], cwd=repo)
    _run_git(["config", "merge.tonic-weave.driver", driver_line], cwd=repo)
    (repo / ".gitattributes").write_text("f.txt merge=tonic-weave\n", encoding="utf-8")
    (repo / "f.txt").write_text("line\n", encoding="utf-8")
    _run_git(["add", "f.txt"], cwd=repo)
    _run_git(["commit", "-m", "base"], cwd=repo)

    _run_git(["checkout", "-b", "left"], cwd=repo)
    (repo / "f.txt").write_text("line\no\n", encoding="utf-8")
    _run_git(["add", "f.txt"], cwd=repo)
    _run_git(["commit", "-m", "left"], cwd=repo)

    _run_git(["checkout", "-b", "right", "HEAD~1"], cwd=repo)
    (repo / "f.txt").write_text("line\nt\n", encoding="utf-8")
    _run_git(["add", "f.txt"], cwd=repo)
    _run_git(["commit", "-m", "right"], cwd=repo)

    env = {
        "TONIC_MERGE_STATE_DIR": str(st_dir),
        "TONIC_MERGE_STRICT": "1",
    }
    m = _run_git(["merge", "left", "--no-edit"], cwd=repo, env=env)
    merged = (repo / "f.txt").read_text(encoding="utf-8")
    assert m.returncode != 0
    assert "<<<<<<<" in merged
    assert "o" in merged and "t" in merged


def _write_merge_manifest_sidecar(
    st_dir: Path,
    *,
    sb: str,
    ours_state: str,
    theirs_state: str,
    text_ours: str,
    text_theirs: str,
    parent_ours: list[str],
    parent_theirs: list[str],
) -> None:
    _, e_base = path_entry_for_file(
        rel_path="f.txt",
        text_canonical="line\n",
        serialized_weave=sb,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
    )
    _, e_ours = path_entry_for_file(
        rel_path="f.txt",
        text_canonical=text_ours,
        serialized_weave=ours_state,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        parent_weave_shas=parent_ours,
    )
    _, e_theirs = path_entry_for_file(
        rel_path="f.txt",
        text_canonical=text_theirs,
        serialized_weave=theirs_state,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        parent_weave_shas=parent_theirs,
    )
    payload = {
        "weave_format_version": "1",
        "diff_engine_id": "tonic-v1",
        "entries": {
            "base": dict(e_base),
            "ours": dict(e_ours),
            "theirs": dict(e_theirs),
        },
    }
    (st_dir / "merge_manifest.json").write_text(json.dumps(payload, sort_keys=True) + "\n", encoding="utf-8")


def test_git_merge_with_merge_manifest_sidecar_parent_ok(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    st_dir = tmp_path / "states"
    repo.mkdir()
    st_dir.mkdir()

    base_lines = ["line"]
    sb = initial_state(base_lines)
    so = update_state(sb, ["line", "o"], commit_id="c1")
    st = update_state(sb, ["line", "t"], commit_id="c2")
    bsha = state_hash(sb)
    (st_dir / "base.state").write_text(sb, encoding="utf-8")
    (st_dir / "ours.state").write_text(st, encoding="utf-8")
    (st_dir / "theirs.state").write_text(so, encoding="utf-8")
    _write_merge_manifest_sidecar(
        st_dir,
        sb=sb,
        ours_state=st,
        theirs_state=so,
        text_ours="line\nt\n",
        text_theirs="line\no\n",
        parent_ours=[bsha],
        parent_theirs=[bsha],
    )

    _run_git(["init"], cwd=repo)
    _run_git(["config", "user.email", "t@e"], cwd=repo)
    _run_git(["config", "user.name", "t"], cwd=repo)
    driver_line = _merge_driver_command_line()
    _run_git(["config", "merge.tonic-weave.name", "tonic weave"], cwd=repo)
    _run_git(["config", "merge.tonic-weave.driver", driver_line], cwd=repo)
    (repo / ".gitattributes").write_text("f.txt merge=tonic-weave\n", encoding="utf-8")
    (repo / "f.txt").write_text("line\n", encoding="utf-8")
    _run_git(["add", "f.txt"], cwd=repo)
    _run_git(["commit", "-m", "base"], cwd=repo)

    _run_git(["checkout", "-b", "left"], cwd=repo)
    (repo / "f.txt").write_text("line\no\n", encoding="utf-8")
    _run_git(["add", "f.txt"], cwd=repo)
    _run_git(["commit", "-m", "left"], cwd=repo)

    _run_git(["checkout", "-b", "right", "HEAD~1"], cwd=repo)
    (repo / "f.txt").write_text("line\nt\n", encoding="utf-8")
    _run_git(["add", "f.txt"], cwd=repo)
    _run_git(["commit", "-m", "right"], cwd=repo)

    env = {
        "TONIC_MERGE_STATE_DIR": str(st_dir),
        "TONIC_MERGE_STRICT": "1",
    }
    m = _run_git(["merge", "left", "--no-edit"], cwd=repo, env=env)
    merged = (repo / "f.txt").read_text(encoding="utf-8")
    assert m.returncode != 0
    assert "<<<<<<<" in merged
    assert "o" in merged and "t" in merged


def test_git_merge_strict_fails_when_merge_manifest_bad_parent(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    st_dir = tmp_path / "states"
    repo.mkdir()
    st_dir.mkdir()

    sb = initial_state(["line"])
    so = update_state(sb, ["line", "o"], commit_id="c1")
    st = update_state(sb, ["line", "t"], commit_id="c2")
    (st_dir / "base.state").write_text(sb, encoding="utf-8")
    (st_dir / "ours.state").write_text(st, encoding="utf-8")
    (st_dir / "theirs.state").write_text(so, encoding="utf-8")
    _write_merge_manifest_sidecar(
        st_dir,
        sb=sb,
        ours_state=st,
        theirs_state=so,
        text_ours="line\nt\n",
        text_theirs="line\no\n",
        parent_ours=["deadbeef" * 8],
        parent_theirs=[state_hash(sb)],
    )

    _run_git(["init"], cwd=repo)
    _run_git(["config", "user.email", "t@e"], cwd=repo)
    _run_git(["config", "user.name", "t"], cwd=repo)
    driver_line = _merge_driver_command_line()
    _run_git(["config", "merge.tonic-weave.name", "tonic weave"], cwd=repo)
    _run_git(["config", "merge.tonic-weave.driver", driver_line], cwd=repo)
    (repo / ".gitattributes").write_text("f.txt merge=tonic-weave\n", encoding="utf-8")
    (repo / "f.txt").write_text("line\n", encoding="utf-8")
    _run_git(["add", "f.txt"], cwd=repo)
    _run_git(["commit", "-m", "base"], cwd=repo)

    _run_git(["checkout", "-b", "left"], cwd=repo)
    (repo / "f.txt").write_text("line\no\n", encoding="utf-8")
    _run_git(["add", "f.txt"], cwd=repo)
    _run_git(["commit", "-m", "left"], cwd=repo)

    _run_git(["checkout", "-b", "right", "HEAD~1"], cwd=repo)
    (repo / "f.txt").write_text("line\nt\n", encoding="utf-8")
    _run_git(["add", "f.txt"], cwd=repo)
    _run_git(["commit", "-m", "right"], cwd=repo)

    env = {
        "TONIC_MERGE_STATE_DIR": str(st_dir),
        "TONIC_MERGE_STRICT": "1",
    }
    m = _run_git(["merge", "left", "--no-edit"], cwd=repo, env=env)
    out = (m.stderr or "") + (m.stdout or "")
    assert m.returncode != 0
    assert "parent_weave_shas" in out
