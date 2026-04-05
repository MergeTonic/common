"""OpenAI-compatible chat.completions (parity with llmRefinement.ts)."""

from __future__ import annotations

import json
import os
import re
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Literal


@dataclass
class LlmChatParams:
    base_url: str
    model: str
    api_key: str
    system: str
    user: str
    timeout_ms: int
    json_object: bool = True


def _strip_json_fence(s: str) -> str:
    t = s.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)```$", t, re.MULTILINE)
    if m:
        return m.group(1).strip()
    return t


def call_openai_compatible_json(params: LlmChatParams) -> tuple[bool, str]:
    url = params.base_url.rstrip("/") + "/chat/completions"
    payload: dict[str, Any] = {
        "model": params.model,
        "messages": [
            {"role": "system", "content": params.system},
            {"role": "user", "content": params.user},
        ],
        "temperature": 0.2,
    }
    if params.json_object:
        payload["response_format"] = {"type": "json_object"}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {params.api_key}",
        },
    )
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=max(1.0, params.timeout_ms / 1000.0), context=ctx) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")[:500]
        return False, f"HTTP {e.code}: {err}"
    except Exception as e:
        return False, str(e)

    try:
        data: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError:
        return False, "invalid JSON from API"

    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return False, "empty completion"
    msg = choices[0]
    if not isinstance(msg, dict):
        return False, "empty completion"
    content = msg.get("message", {})
    text = content.get("content", "") if isinstance(content, dict) else ""
    if not isinstance(text, str) or not text.strip():
        return False, "empty completion"
    return True, _strip_json_fence(text)


def _hf_chat_content(resp: Any) -> str:
    if resp is None:
        return ""
    choices = getattr(resp, "choices", None)
    if choices is None and isinstance(resp, dict):
        choices = resp.get("choices")
    if not choices:
        return ""
    ch0 = choices[0]
    msg = getattr(ch0, "message", None)
    if msg is None and isinstance(ch0, dict):
        msg = ch0.get("message")
    if isinstance(msg, dict):
        c = msg.get("content")
        return c if isinstance(c, str) else ""
    if msg is not None:
        c = getattr(msg, "content", None)
        return c if isinstance(c, str) else ""
    return ""


def call_hf_inference_json(params: LlmChatParams) -> tuple[bool, str]:
    try:
        from huggingface_hub import InferenceClient
    except Exception as e:
        return False, f"huggingface_hub import failed: {e}"
    token = (os.environ.get("HF_TOKEN") or params.api_key or "").strip()
    if not token:
        return False, "HF_TOKEN (or api_key) required for hf_inference LLM"
    model = (os.environ.get("TONIC_HF_CHAT_MODEL") or params.model or "").strip()
    if not model:
        return False, "TONIC_HF_CHAT_MODEL or pipeline llm model required for hf_inference"
    provider = (os.environ.get("TONIC_HF_INFERENCE_PROVIDER") or "").strip() or None
    client = InferenceClient(api_key=token, provider=provider)
    messages = [
        {"role": "system", "content": params.system},
        {"role": "user", "content": params.user},
    ]
    if params.json_object:
        try:
            resp = client.chat_completion(
                model=model,
                messages=messages,
                max_tokens=2048,
                response_format={"type": "json_object"},
            )
            text = _hf_chat_content(resp)
            if text.strip():
                return True, _strip_json_fence(text)
        except Exception:
            pass
    try:
        resp = client.chat_completion(model=model, messages=messages, max_tokens=2048)
        text = _hf_chat_content(resp)
        if not text.strip():
            return False, "empty hf_inference completion"
        return True, _strip_json_fence(text)
    except Exception as e:
        return False, str(e)


def call_llm_json(params: LlmChatParams) -> tuple[bool, str]:
    backend = (os.environ.get("TONIC_LLM_BACKEND") or "").strip().lower()
    if backend in ("hf_inference", "hf-inference"):
        return call_hf_inference_json(params)
    return call_openai_compatible_json(params)


def parse_question_refinement_json(
    raw: str, mode: Literal["improver", "subquestions"]
) -> tuple[bool, str, dict[str, Any]]:
    try:
        j: Any = json.loads(raw)
    except json.JSONDecodeError:
        return False, "invalid JSON from model", {}
    if not isinstance(j, dict):
        return False, "model JSON must be object", {}
    if mode == "improver":
        left = j.get("refined_left_intent") if isinstance(j.get("refined_left_intent"), str) else ""
        right = j.get("refined_right_intent") if isinstance(j.get("refined_right_intent"), str) else ""
        mg = j.get("merge_goals")
        ass = j.get("assumptions")
        merge_goals = [x for x in mg if isinstance(x, str)] if isinstance(mg, list) else []
        assumptions = [x for x in ass if isinstance(x, str)] if isinstance(ass, list) else []
        if not left or not right:
            return False, "improver JSON missing refined_left_intent/refined_right_intent", {}
        return True, "", {
            "refined_left_intent": left,
            "refined_right_intent": right,
            "merge_goals": merge_goals,
            "assumptions": assumptions,
        }
    sq = j.get("subquestions")
    out_sq: list[dict[str, Any]] = []
    if isinstance(sq, list):
        for item in sq:
            if not isinstance(item, dict):
                continue
            sid = item.get("id")
            stext = item.get("text")
            if not isinstance(sid, str) or not isinstance(stext, str):
                continue
            pr = item.get("priority")
            entry: dict[str, Any] = {"id": sid, "text": stext}
            if isinstance(pr, (int, float)):
                entry["priority"] = int(pr)
            out_sq.append(entry)
    out_sq.sort(key=lambda x: (x.get("priority", 0), x.get("id", "")))
    if not out_sq:
        return False, "subquestions JSON missing non-empty subquestions", {}
    return True, "", {"subquestions": out_sq[:8]}
