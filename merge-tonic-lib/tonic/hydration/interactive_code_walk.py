"""Optional LLM reflection step for code-walk trace (parity with TS enrichCodeWalkTraceWithLlmReflection)."""

from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.request
from typing import Any


def enrich_code_walk_trace_with_llm(
    trace: dict[str, Any],
    *,
    left_intent: str,
    right_intent: str,
    retrieval_hits: list[dict[str, Any]],
    env: dict[str, str],
) -> dict[str, Any]:
    api_key = (env.get("OPENAI_API_KEY") or env.get("TONIC_OPENAI_API_KEY") or "").strip()
    base_url = (env.get("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
    model = (env.get("TONIC_CODE_WALK_MODEL") or env.get("TONIC_LLM_MODEL") or "gpt-4o-mini").strip()

    steps = list(trace.get("steps") or [])
    plan = list(trace.get("plan") or [])

    if not api_key:
        steps.append(
            {
                "tool": "llm_reflection",
                "outcome": {
                    "insights": [
                        "Interactive code-walk reflection skipped: set OPENAI_API_KEY "
                        "(or TONIC_OPENAI_API_KEY) to enable --enable-code-walk-agent."
                    ],
                    "mode": "skipped_no_credentials",
                },
            }
        )
        return {**trace, "steps": steps}

    top_chunks: list[dict[str, Any]] = []
    for h in retrieval_hits[:10]:
        if not isinstance(h, dict):
            continue
        meta = h.get("metadata") if isinstance(h.get("metadata"), dict) else {}
        top_chunks.append(
            {
                "path": meta.get("path"),
                "lines": f'{meta.get("start_line", "")}-{meta.get("end_line", "")}',
                "text": str(h.get("text") or "")[:400],
            }
        )

    user = (
        "Merge intents:\n"
        f"LEFT: {left_intent}\n"
        f"RIGHT: {right_intent}\n\n"
        "Top retrieval chunks (JSON):\n"
        f"{json.dumps(top_chunks, indent=2)}\n\n"
        'Reply with compact JSON only: {"insights": string[], "plan_note": string} '
        "summarizing what to inspect next for resolving the merge. Max 5 insights."
    )

    body = json.dumps(
        {
            "model": model,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You help engineers navigate code during merge hydration. "
                        "Output only valid JSON with keys insights (array of short strings) "
                        "and plan_note (string)."
                    ),
                },
                {"role": "user", "content": user},
            ],
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=60.0, context=ctx) as resp:
            raw = json.loads(resp.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")[:500]
        steps.append(
            {
                "tool": "llm_reflection",
                "outcome": {"insights": [f"LLM reflection failed: HTTP {e.code}: {err}"], "mode": "error"},
            }
        )
        return {**trace, "steps": steps}
    except Exception as e:
        steps.append(
            {
                "tool": "llm_reflection",
                "outcome": {"insights": [f"LLM reflection failed: {e}"], "mode": "error"},
            }
        )
        return {**trace, "steps": steps}

    choices = raw.get("choices") or []
    text = ""
    if choices and isinstance(choices[0], dict):
        msg = choices[0].get("message") or {}
        if isinstance(msg, dict):
            text = str(msg.get("content") or "").strip()

    insights: list[str] = [text[:2000]] if text else ["empty completion"]
    plan_note = ""
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            ins = parsed.get("insights")
            if isinstance(ins, list):
                insights = [str(x) for x in ins if x]
            if isinstance(parsed.get("plan_note"), str):
                plan_note = parsed["plan_note"]
    except json.JSONDecodeError:
        pass

    plan.append(
        {
            "id": "llm-reflection",
            "goal": "One-shot reflection over retrieval context",
            "mode": "llm",
        }
    )
    steps.append(
        {
            "tool": "llm_reflection",
            "outcome": {
                "insights": insights,
                "plan_note": plan_note,
                "model": model,
                "mode": "interactive_llm",
            },
        }
    )
    return {**trace, "plan": plan, "steps": steps}
