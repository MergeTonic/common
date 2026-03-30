"""JSONL transcript helpers for hydration LLM stages."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path

from .types import HydrationPipelineRun


def append_hydration_llm_transcript_event(run: HydrationPipelineRun, **event: object) -> str:
    target = Path(run.artifacts.llm_transcript_path or (Path(run.artifacts.run_state_path).parent / "llm.jsonl"))
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "ts": str(event.get("ts") or datetime.now(timezone.utc).isoformat()),
        **event,
    }
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload) + "\n")
    run.artifacts.llm_transcript_path = str(target)
    return str(target)
