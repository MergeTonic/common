#!/usr/bin/env python3
"""Copy canonical conflict-AI prompt bundle into GitHub agent trees.

Canonical source is package-first (`packages/tonic-core/.../conflictPrompts.v1.json`).
Fallback remains `agents/shared-tonic-ai-prompts/prompts.v1.json` until final cleanup.
Hydration prompt bundles intentionally live with the owning CLI packages and are not
synced by this script.
"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_CANONICAL = (
    ROOT
    / "packages"
    / "tonic-core"
    / "src"
    / "hydration"
    / "prompts"
    / "conflictPrompts.v1.json"
)
LEGACY_CANONICAL = ROOT / "agents" / "shared-tonic-ai-prompts" / "prompts.v1.json"
NODE_DST = ROOT / "agents" / "github-action-agent-node" / "src" / "data" / "aiPrompts.v1.json"
PY_DST = ROOT / "agents" / "github-action-agent" / "src" / "tonic_agent" / "data" / "ai_prompts.v1.json"


def _resolve_canonical() -> Path:
    if PACKAGE_CANONICAL.is_file():
        return PACKAGE_CANONICAL
    if LEGACY_CANONICAL.is_file():
        return LEGACY_CANONICAL
    raise SystemExit(
        "missing canonical prompts: "
        f"{PACKAGE_CANONICAL} (preferred) or {LEGACY_CANONICAL} (fallback)"
    )


def main() -> int:
    canonical = _resolve_canonical()
    destinations = [NODE_DST, PY_DST]
    if canonical != LEGACY_CANONICAL:
        destinations.append(LEGACY_CANONICAL)
    for dst in destinations:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(canonical, dst)
        print(f"synced {canonical} -> {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
