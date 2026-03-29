#!/usr/bin/env python3
"""Copy canonical AI prompt bundle into both GitHub agent trees (must stay byte-identical)."""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "agents" / "shared-tonic-ai-prompts" / "prompts.v1.json"
NODE_DST = ROOT / "agents" / "github-action-agent-node" / "src" / "data" / "aiPrompts.v1.json"
PY_DST = ROOT / "agents" / "github-action-agent" / "src" / "tonic_agent" / "data" / "ai_prompts.v1.json"


def main() -> int:
    if not CANONICAL.is_file():
        raise SystemExit(f"missing canonical prompts: {CANONICAL}")
    for dst in (NODE_DST, PY_DST):
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(CANONICAL, dst)
        print(f"synced -> {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
