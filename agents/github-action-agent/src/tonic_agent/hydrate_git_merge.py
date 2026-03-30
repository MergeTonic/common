"""Hydrate files from a real git merge in an isolated workspace."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from .git_merge_hydration import GitMergeHydrationOptions, git_blocks_to_tonic_annotated

BINARY_EXTENSIONS = frozenset(
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".ico",
        ".pdf",
        ".zip",
        ".gz",
        ".tgz",
        ".bz2",
        ".7z",
        ".rar",
        ".exe",
        ".dll",
        ".so",
        ".dylib",
        ".woff",
        ".woff2",
        ".ttf",
        ".eot",
        ".mp3",
        ".mp4",
        ".webm",
        ".wasm",
        ".pyc",
        ".class",
        ".jar",
    }
)


def is_probably_text_path(path: str) -> bool:
    lower = path.lower()
    for ext in BINARY_EXTENSIONS:
        if lower.endswith(ext):
            return False
    return True


def _run_git(workspace: str, args: list[str], *, allow_fail: bool = False) -> str:
    cp = subprocess.run(
        ["git", *args],
        cwd=workspace,
        text=True,
        capture_output=True,
        check=False,
    )
    if cp.returncode != 0 and not allow_fail:
        raise RuntimeError(cp.stderr.strip() or cp.stdout.strip() or f"git {' '.join(args)} failed")
    output = (cp.stdout or "") + (("\n" + cp.stderr) if cp.stderr else "")
    return output


def _current_branch(workspace: str) -> str:
    out = _run_git(
        workspace,
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        allow_fail=True,
    ).strip()
    if not out or "fatal:" in out.lower():
        return ""
    return out.splitlines()[0].strip()


def _parse_git_conflicts(lines: list[str]) -> list[tuple[list[str], list[str]]]:
    blocks: list[tuple[list[str], list[str]]] = []
    i = 0
    while i < len(lines):
        if not lines[i].startswith("<<<<<<< "):
            i += 1
            continue
        i += 1
        left: list[str] = []
        right: list[str] = []
        while i < len(lines) and not lines[i].startswith("======="):
            left.append(lines[i])
            i += 1
        if i < len(lines):
            i += 1
        while i < len(lines) and not lines[i].startswith(">>>>>>> "):
            right.append(lines[i])
            i += 1
        if i < len(lines):
            i += 1
        blocks.append((left, right))
    return blocks


def _read_stage_lines(workspace: str, stage: str, rel_path: str) -> list[str]:
    out = _run_git(workspace, ["show", f":{stage}:{rel_path}"], allow_fail=True)
    if not out:
        return []
    lines = out.splitlines()
    if lines and lines[-1] == "":
        lines = lines[:-1]
    return lines


def hydrate_git_merge(
    *,
    workspace: str,
    base_sha: str,
    head_sha: str,
    max_files: int,
    git_merge_hydration: GitMergeHydrationOptions | None = None,
) -> dict[str, dict[str, object]]:
    isolated_workspace = (Path(str(workspace))).resolve()
    expected_iso = (
        Path(os.environ.get("TONIC_AGENT_ISOLATED_WORKSPACE", "")).resolve()
        if os.environ.get("TONIC_AGENT_ISOLATED_WORKSPACE")
        else None
    )
    if expected_iso is not None and isolated_workspace != expected_iso:
        raise RuntimeError(
            "hydrate_git_merge workspace mismatch with TONIC_AGENT_ISOLATED_WORKSPACE"
        )
    if expected_iso is None and os.environ.get("GITHUB_ACTIONS") == "true":
        raise RuntimeError("hydrate_git_merge requires TONIC_AGENT_ISOLATED_WORKSPACE in GitHub Actions")
    original_branch = _current_branch(workspace)
    try:
        _run_git(workspace, ["checkout", "-f", base_sha])
        merge_output = _run_git(workspace, ["merge", "--no-ff", "--no-commit", head_sha], allow_fail=True)
        names_raw = _run_git(workspace, ["diff", "--name-only", "--diff-filter", "U"], allow_fail=True)
        names = [n.strip() for n in names_raw.splitlines() if n.strip()]
        if ("fatal:" in merge_output.lower() or "error:" in merge_output.lower()) and not names:
            raise RuntimeError(f"git merge failed without unmerged files: {merge_output.strip()}")
        out: dict[str, dict[str, object]] = {}
        for rel in names:
            if len(out) >= max_files:
                break
            if not is_probably_text_path(rel):
                continue
            file_path = Path(workspace) / rel
            if not file_path.exists():
                continue
            merged_lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
            if not any(ln.startswith("<<<<<<< ") for ln in merged_lines):
                continue
            blocks = _parse_git_conflicts(merged_lines)
            out[rel] = {
                "left_lines": _read_stage_lines(workspace, "2", rel),
                "right_lines": _read_stage_lines(workspace, "3", rel),
                "status": "unmerged",
                "annotated_lines": git_blocks_to_tonic_annotated(
                    blocks,
                    workspace=workspace,
                    base_sha=base_sha,
                    head_sha=head_sha,
                    opts=git_merge_hydration,
                ),
                "merged_lines": merged_lines,
            }
        return out
    finally:
        _run_git(workspace, ["merge", "--abort"], allow_fail=True)
        if original_branch:
            _run_git(workspace, ["checkout", "-f", original_branch], allow_fail=True)
