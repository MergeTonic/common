"""Agent prompt JSON copies must match (same contract as Node promptBundleParity.test.ts)."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
NODE = ROOT / "agents" / "github-action-agent-node" / "src" / "data" / "aiPrompts.v1.json"
PY = ROOT / "agents" / "github-action-agent" / "src" / "tonic_agent" / "data" / "ai_prompts.v1.json"


def test_agent_prompt_bundles_byte_identical() -> None:
    assert NODE.read_bytes() == PY.read_bytes()
