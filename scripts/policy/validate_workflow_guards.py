#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def _read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def main() -> int:
    failures: list[str] = []

    tonic = _read(".github/workflows/tonic-pr-agent.yml")
    if "if: github.actor != 'github-actions[bot]' && !startsWith(github.head_ref, 'sync/')" not in tonic:
        failures.append("tonic-pr-agent.yml missing bot/sync recursion guard")

    release = _read(".github/workflows/release-orchestrator.yml")
    if "github.ref == 'refs/heads/main'" not in release:
        failures.append("release-orchestrator.yml missing main-ref guard for protected jobs")
    if "group: release-orchestrator-${{ github.ref }}-${{ inputs.release_mode }}" not in release:
        failures.append("release-orchestrator.yml missing expected concurrency group")

    sync = _read(".github/workflows/sync-target-repos.yml")
    if "group: sync-${{ matrix.target.id }}-${{ inputs.target_branch }}-${{ inputs.sync_mode }}" not in sync:
        failures.append("sync-target-repos.yml missing target_branch/sync_mode concurrency key")

    publish_files = [
        ".github/workflows/publish-agent-pypi.yml",
        ".github/workflows/publish-agent-npm.yml",
        ".github/workflows/publish-core.yml",
        ".github/workflows/publish-npm.yml",
        ".github/workflows/publish-extension.yml",
        ".github/workflows/publish-hf-weave-npm.yml",
        ".github/workflows/publish-hf-weave-pypi.yml",
    ]
    for wf in publish_files:
        content = _read(wf)
        # Allow YAML-escaped single quotes (''refs/...'') inside workflow if: expressions.
        if "refs/heads/main" not in content or "github.ref" not in content:
            failures.append(f"{wf} missing main-ref publish guard")
        if "mergetonic/common" not in content or "github.repository" not in content:
            failures.append(f"{wf} missing repository publish guard")

    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1

    print("workflow guard contracts validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
