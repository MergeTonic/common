"""
Multi-turn code-search agent for hydrate (parity with `runCodeSearchAgentTurns` in TS).

Indexes ast-grep chunks into a memory vector index, then runs an OpenAI-compatible
chat loop that selects semantic_query / regex_search / symbol_search / done.
"""

from __future__ import annotations

import json
import re
import ssl
import urllib.error
import urllib.request
from typing import Any, Protocol

from tonic.hydration.ast_grep_chunker import chunks_from_ast_artifact
from tonic.hydration.embedding_provider import EmbeddingProvider, resolve_embedding_provider
from tonic.hydration.memory_index import MemoryVectorIndex
from tonic.hydration.search_agent_tools import regex_search_hits, symbol_search_hits


class _Embedder(Protocol):
    def embed_batch(self, texts: list[str]) -> list[list[float]]: ...


def code_search_agent_python_status() -> str:
    return "python_v1"


def _strip_fence(s: str) -> str:
    t = s.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)```$", t, re.MULTILINE)
    if m:
        return m.group(1).strip()
    return t


def index_ast_chunks_for_code_search(
    repo_root: str,
    matches: list[dict[str, Any]],
    index: MemoryVectorIndex,
    embedder: _Embedder,
) -> int:
    chunks = chunks_from_ast_artifact(repo_root, matches)
    if not chunks:
        return 0
    texts = [f"{c['path']}\n{c['text']}" for c in chunks]
    embeddings = embedder.embed_batch(texts)
    records: list[dict[str, Any]] = []
    for i, c in enumerate(chunks):
        mid = str(c.get("ast_match_id") or f"chunk-{i}")
        records.append(
            {
                "id": mid,
                "document": texts[i],
                "embedding": embeddings[i],
                "metadata": {
                    "path": c["path"],
                    "start_line": c["start_line"],
                    "end_line": c["end_line"],
                    "source": "memory",
                    "ast_rule_id": c.get("ast_rule_id"),
                    "ast_match_id": c.get("ast_match_id"),
                    "symbol": c.get("symbol"),
                },
            }
        )
    index.upsert(records)
    return len(records)


def _query_to_hits(
    index: MemoryVectorIndex, embedder: _Embedder, query: str, top_k: int
) -> list[dict[str, Any]]:
    embs = embedder.embed_batch([query])
    res = index.query(embs[0], top_k)
    hits: list[dict[str, Any]] = []
    for i, rid in enumerate(res["ids"]):
        hits.append(
            {
                "chunk_id": rid,
                "text": res["documents"][i],
                "score": 1.0 - res["distances"][i],
                "metadata": dict(res["metadatas"][i] or {}),
            }
        )
    return hits


def _chat_completion_text(
    *,
    base_url: str,
    model: str,
    api_key: str,
    system: str,
    user: str,
    timeout_sec: float,
) -> tuple[bool, str]:
    url = base_url.rstrip("/") + "/chat/completions"
    payload: dict[str, Any] = {
        "model": model,
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=max(1.0, timeout_sec), context=ctx) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        t = e.read().decode("utf-8", errors="replace")[:400]
        return False, f"HTTP {e.code}: {t}"
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
    if not isinstance(text, str):
        return False, "empty completion"
    return True, text.strip()


def _chat_completion_hf_inference(
    *,
    model: str,
    system: str,
    user: str,
    timeout_sec: float,
) -> tuple[bool, str]:
    try:
        from huggingface_hub import InferenceClient
    except Exception as e:
        return False, str(e)
    import os

    token = (os.environ.get("HF_TOKEN") or "").strip()
    if not token:
        return False, "HF_TOKEN required for TONIC_LLM_BACKEND=hf_inference"
    m = (os.environ.get("TONIC_HF_CHAT_MODEL") or model or "").strip()
    if not m:
        return False, "TONIC_HF_CHAT_MODEL required"
    provider = (os.environ.get("TONIC_HF_INFERENCE_PROVIDER") or "").strip() or None
    client = InferenceClient(api_key=token, provider=provider)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    try:
        resp = client.chat_completion(model=m, messages=messages, max_tokens=2048)
    except Exception as e:
        return False, str(e)
    choices = getattr(resp, "choices", None)
    if choices is None and isinstance(resp, dict):
        choices = resp.get("choices")
    if not choices:
        return False, "empty completion"
    ch0 = choices[0]
    msg = getattr(ch0, "message", None)
    if msg is None and isinstance(ch0, dict):
        msg = ch0.get("message")
    text = ""
    if isinstance(msg, dict):
        text = str(msg.get("content") or "")
    elif msg is not None:
        text = str(getattr(msg, "content", "") or "")
    if not text.strip():
        return False, "empty completion"
    return True, text.strip()


def _chat_completion_dispatch(
    *,
    env: dict[str, str],
    base_url: str,
    model: str,
    api_key: str,
    system: str,
    user: str,
    timeout_sec: float,
) -> tuple[bool, str]:
    b = (env.get("TONIC_LLM_BACKEND") or "").strip().lower()
    if b in ("hf_inference", "hf-inference"):
        return _chat_completion_hf_inference(model=model, system=system, user=user, timeout_sec=timeout_sec)
    return _chat_completion_text(
        base_url=base_url,
        model=model,
        api_key=api_key,
        system=system,
        user=user,
        timeout_sec=timeout_sec,
    )


def run_code_search_agent_turns(
    *,
    repo_root: str,
    matches: list[dict[str, Any]],
    env: dict[str, str],
    llm_model: str,
    llm_base_url: str,
    api_key: str,
    seed_query: str,
    max_turns: int = 3,
) -> list[dict[str, Any]]:
    index = MemoryVectorIndex()
    embedder: EmbeddingProvider = resolve_embedding_provider(env)
    index_ast_chunks_for_code_search(repo_root, matches, index, embedder)

    steps: list[dict[str, Any]] = []
    timeout_ms = int((env.get("TONIC_LLM_TIMEOUT_MS") or "120000").strip() or "120000") or 120000
    timeout_sec = max(1.0, timeout_ms / 1000.0)
    base_url = llm_base_url.rstrip("/")
    pool: list[dict[str, Any]] | None = None

    system = (
        'You choose search tools for merge hydration. Reply JSON only: {"tool":"semantic_query"|'
        '"regex_search"|"symbol_search"|"done","query"?:string,"pattern"?:string,"symbol"?:string}. '
        "semantic_query uses vector search; regex_search and symbol_search filter a materialized chunk pool."
    )

    for turn in range(max_turns):
        prior = (
            json.dumps(
                [
                    {
                        "tool": s.get("tool"),
                        "summary": (s.get("outcome") or {}).get("summary")
                        if isinstance(s.get("outcome"), dict)
                        else None,
                    }
                    for s in steps
                ]
            )
            if steps
            else "[]"
        )
        user = f"Turn {turn + 1}/{max_turns}. Prior steps: {prior}\nPick the next tool or done."
        ok, raw = _chat_completion_dispatch(
            env=env,
            base_url=base_url,
            model=llm_model,
            api_key=api_key,
            system=system,
            user=user,
            timeout_sec=timeout_sec,
        )
        if not ok:
            steps.append({"tool": "llm_error", "outcome": {"message": raw[:500]}})
            break
        try:
            plan = json.loads(_strip_fence(raw))
        except json.JSONDecodeError:
            steps.append({"tool": "llm_parse_error", "outcome": {"raw": raw[:800]}})
            break
        if not isinstance(plan, dict):
            steps.append({"tool": "llm_parse_error", "outcome": {"raw": raw[:800]}})
            break
        tool = str(plan.get("tool") or "").lower()
        if tool == "done":
            if turn == 0 and seed_query.strip():
                hits = _query_to_hits(index, embedder, seed_query.strip(), 12)
                steps.append(
                    {
                        "tool": "semantic_query",
                        "outcome": {
                            "chunks": hits[:8],
                            "summary": "seed query (model returned done)",
                        },
                    }
                )
            steps.append({"tool": "done", "outcome": {"reason": "model_done"}})
            break
        if tool == "semantic_query" and str(plan.get("query") or "").strip():
            q = str(plan["query"]).strip()
            hits = _query_to_hits(index, embedder, q, 12)
            steps.append(
                {"tool": "semantic_query", "outcome": {"chunks": hits[:8], "query": q}}
            )
            continue
        if pool is None:
            pool = _query_to_hits(index, embedder, "merge hydration retrieval context", 128)
        if tool == "regex_search" and plan.get("pattern"):
            hits = regex_search_hits(pool, str(plan["pattern"]))
            steps.append(
                {
                    "tool": "regex_search",
                    "outcome": {"chunks": hits[:12], "pattern": str(plan["pattern"])},
                }
            )
            continue
        if tool == "symbol_search" and plan.get("symbol"):
            hits = symbol_search_hits(pool, str(plan["symbol"]))
            steps.append(
                {
                    "tool": "symbol_search",
                    "outcome": {"chunks": hits[:12], "symbol": str(plan["symbol"])},
                }
            )
            continue
        steps.append({"tool": "llm_invalid_tool", "outcome": {"plan": plan}})
        break

    return steps


def run_code_search_agent_for_hydrate(
    *,
    repo_root: str,
    matches: list[dict[str, Any]],
    env: dict[str, str],
    intent_left: str,
    intent_right: str,
    llm_model: str,
    llm_base_url: str,
    openai_api_key_env: str,
) -> list[dict[str, Any]]:
    """
    Steps to append to code-walk trace (parity with TS pipeline.ts enableCodeWalkSearchAgent branch).
    """
    api_key = (
        (env.get("OPENAI_API_KEY") or env.get("TONIC_OPENAI_API_KEY") or env.get(openai_api_key_env) or "")
        .strip()
    )
    base_lower = llm_base_url.lower()
    localhost = (
        "127.0.0.1" in base_lower or "localhost" in base_lower or "0.0.0.0" in base_lower
    )
    allow_dummy = (env.get("TONIC_LLM_ALLOW_DUMMY_KEY") or "").strip() == "1"
    if not api_key and (localhost or allow_dummy):
        api_key = "dummy"
    if not api_key:
        return [
            {
                "tool": "code_search_agent",
                "outcome": {
                    "insights": [
                        "Code-search agent skipped: set OPENAI_API_KEY, or point --llm-base-url at "
                        "localhost/127.0.0.1, or set TONIC_LLM_ALLOW_DUMMY_KEY=1 for a private "
                        "OpenAI-compatible server."
                    ],
                    "mode": "skipped_no_credentials",
                },
            }
        ]
    try:
        mt = int((env.get("TONIC_CODE_SEARCH_MAX_TURNS") or "3").strip())
    except ValueError:
        mt = 3
    max_turns = min(6, max(1, mt))
    seed = f"{intent_left} {intent_right}".strip()[:400]
    key = api_key or "dummy"
    return run_code_search_agent_turns(
        repo_root=repo_root,
        matches=matches,
        env=env,
        llm_model=llm_model.strip() or "gpt-4o-mini",
        llm_base_url=llm_base_url.strip() or "https://api.openai.com/v1",
        api_key=key,
        seed_query=seed,
        max_turns=max_turns,
    )
