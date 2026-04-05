"""Batch memory retrieval + code-walk trace (parity with @mergetonic/coding-hydration)."""

from __future__ import annotations

import os
from typing import Any

from tonic.hydration.ast_grep_chunker import chunks_from_ast_artifact
from tonic.hydration.chroma_client import chroma_add, chroma_delete_ids, chroma_get_or_create_collection_id, chroma_query
from tonic.hydration.embedding_provider import EmbeddingProvider, HistogramEmbeddingProvider
from tonic.hydration.memory_index import MemoryVectorIndex
from tonic.hydration.memory_vector_snapshot import build_vector_records_with_cache, resolve_vector_cache_options


def build_empty_retrieval_artifact() -> dict[str, Any]:
    return {"schema": "tonic-retrieval-hydration", "version": "1", "hits": []}


def _build_ast_line_map(matches: list[dict[str, Any]]) -> dict[str, set[int]]:
    m: dict[str, set[int]] = {}
    for x in matches:
        if not isinstance(x, dict):
            continue
        p = str(x.get("path", "")).replace("\\", "/")
        start = x.get("start") or {}
        end = x.get("end") or {}
        lo = int(start.get("line", 1)) if isinstance(start, dict) else 1
        hi = int(end.get("line", lo)) if isinstance(end, dict) else lo
        hi = max(lo, hi)
        s = m.setdefault(p, set())
        for ln in range(lo, hi + 1):
            s.add(ln)
    return m


def _conflict_mid_map(regions: list[dict[str, Any]] | None) -> dict[str, list[int]]:
    out: dict[str, list[int]] = {}
    if not regions:
        return out
    for r in regions:
        if not isinstance(r, dict):
            continue
        p = str(r.get("path", "")).replace("\\", "/")
        mid = r.get("mid_line")
        if isinstance(mid, int):
            out.setdefault(p, []).append(mid)
    return out


def attach_ast_metadata(
    hits: list[dict[str, Any]],
    ast_paths_to_lines: dict[str, set[int]],
    conflict_mid_lines: dict[str, list[int]] | None = None,
    *,
    alpha: float = 0.35,
    proximity_n: int = 5,
    prox_boost: float = 0.15,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    cm = conflict_mid_lines or {}
    for h in hits:
        meta = dict(h.get("metadata") or {})
        path_norm = str(meta.get("path", "")).replace("\\", "/")
        start = int(meta.get("start_line", 0) or 0)
        end = int(meta.get("end_line", start) or start)
        hit_lo = min(start, end) if start and end else (start or 1)
        hit_hi = max(start, end) if start and end else hit_lo
        span = hit_hi - hit_lo + 1 if hit_hi >= hit_lo else 1
        lines = ast_paths_to_lines.get(path_norm, set())
        overlap = sum(1 for ln in range(hit_lo, hit_hi + 1) if ln in lines)
        overlap_ratio = overlap / span if span else 0.0
        boost = 1.0 + alpha * overlap_ratio
        nearest: str | None = None
        mids = cm.get(path_norm, [])
        if mids:
            best_d = float("inf")
            for mid in mids:
                for ln in range(hit_lo, hit_hi + 1):
                    d = abs(ln - mid)
                    if d < best_d:
                        best_d = d
            if best_d <= proximity_n:
                boost *= 1.0 + prox_boost * (1.0 - best_d / (proximity_n + 1))
                nearest = f"mid_distance_{int(best_d)}"
        base = float(h.get("score", 0.0))
        meta.setdefault("source", "memory")
        meta["ast_boost_applied"] = boost - 1.0
        if nearest:
            meta["nearest_conflict_region_id"] = nearest
        out.append({**h, "score": base * boost, "metadata": meta})
    return out


def run_chroma_retrieval_for_hydrate(
    *,
    repo_root: str,
    matches: list[dict[str, Any]],
    queries: list[str],
    top_k_per_query: int,
    conflict_regions: list[dict[str, Any]] | None,
    embedder: EmbeddingProvider,
    env: dict[str, str],
) -> list[dict[str, Any]]:
    base = (env.get("TONIC_CHROMA_URL") or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("TONIC_RETRIEVAL_BACKEND=chroma requires TONIC_CHROMA_URL")
    coll = (env.get("TONIC_CHROMA_COLLECTION") or "tonic-hydration").strip()
    chunks = chunks_from_ast_artifact(repo_root, matches)
    if not chunks or not queries:
        return []
    ids = [str(c.get("ast_match_id") or f"chunk-{i}") for i, c in enumerate(chunks)]
    texts = [f"{c['path']}\n{c['text']}" for c in chunks]
    embeddings = embedder.embed_batch(texts)
    dim = len(embeddings[0]) if embeddings else 0
    col_id = chroma_get_or_create_collection_id(base, coll, embedding_dim=dim if dim > 0 else None)
    chroma_delete_ids(base, col_id, ids)
    metadatas = [
        {
            "path": c["path"],
            "start_line": c["start_line"],
            "end_line": c["end_line"],
            "source": "chroma",
            "ast_rule_id": c.get("ast_rule_id"),
            "ast_match_id": c.get("ast_match_id"),
        }
        for c in chunks
    ]
    chroma_add(
        base,
        col_id,
        ids=ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas,
    )
    ast_map = _build_ast_line_map(matches)
    cm = _conflict_mid_map(conflict_regions)
    q_vecs = embedder.embed_batch(queries)
    collected: list[dict[str, Any]] = []
    for qi, _q in enumerate(queries):
        res = chroma_query(base, col_id, q_vecs[qi], top_k_per_query)
        ids0 = (res.get("ids") or [[]])[0] if isinstance(res.get("ids"), list) else []
        docs0 = (res.get("documents") or [[]])[0] if isinstance(res.get("documents"), list) else []
        metas0 = (res.get("metadatas") or [[]])[0] if isinstance(res.get("metadatas"), list) else []
        dists0 = (res.get("distances") or [[]])[0] if isinstance(res.get("distances"), list) else []
        if not isinstance(ids0, list):
            ids0 = []
        for i, rid in enumerate(ids0):
            collected.append(
                {
                    "chunk_id": str(rid),
                    "text": str(docs0[i]) if i < len(docs0) else "",
                    "score": 1.0 - float(dists0[i]) if i < len(dists0) else 0.0,
                    "metadata": dict(metas0[i]) if i < len(metas0) and isinstance(metas0[i], dict) else {},
                }
            )
    best: dict[str, dict[str, Any]] = {}
    for h in collected:
        cid = str(h["chunk_id"])
        prev = best.get(cid)
        if prev is None or float(h.get("score", 0)) > float(prev.get("score", 0)):
            best[cid] = h
    merged = sorted(best.values(), key=lambda x: float(x.get("score", 0)), reverse=True)
    cap = top_k_per_query * max(1, len(queries))
    return attach_ast_metadata(merged[:cap], ast_map, cm)


def run_memory_retrieval_for_hydrate(
    *,
    repo_root: str,
    matches: list[dict[str, Any]],
    queries: list[str],
    top_k_per_query: int,
    conflict_regions: list[dict[str, Any]] | None = None,
    embedder: EmbeddingProvider | None = None,
    env: dict[str, str] | None = None,
    vector_cache_path: str = "",
    vector_cache_mode: str = "",
    vector_cache_diagnostics: dict[str, str] | None = None,
    vector_cache_warnings_out: list[dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    chunks = chunks_from_ast_artifact(repo_root, matches)
    if not chunks or not queries:
        return []
    emb = embedder or HistogramEmbeddingProvider()
    env_map = env if env is not None else dict(os.environ)
    cache_path, cache_mode = resolve_vector_cache_options(
        env_map, path_override=vector_cache_path, mode_override=vector_cache_mode
    )
    index = MemoryVectorIndex()
    if cache_path and cache_mode != "off":
        records = build_vector_records_with_cache(
            repo_root=repo_root,
            matches=matches,
            embedder=emb,
            env=env_map,
            cache_path=cache_path,
            cache_mode=cache_mode,
            diagnostics=vector_cache_diagnostics,
            warnings_out=vector_cache_warnings_out,
        )
    else:
        docs = [f"{c['path']}\n{c['text']}" for c in chunks]
        doc_vecs = emb.embed_batch(docs)
        records = []
        for i, c in enumerate(chunks):
            doc = docs[i]
            mid = c.get("ast_match_id") or f"chunk-{i}"
            records.append(
                {
                    "id": str(mid),
                    "document": doc,
                    "embedding": doc_vecs[i],
                    "metadata": {
                        "path": c["path"],
                        "start_line": c["start_line"],
                        "end_line": c["end_line"],
                        "source": "memory",
                        "ast_rule_id": c.get("ast_rule_id"),
                        "ast_match_id": c.get("ast_match_id"),
                    },
                }
            )
    index.upsert(records)
    ast_map = _build_ast_line_map(matches)
    cm = _conflict_mid_map(conflict_regions)
    q_vecs = emb.embed_batch(queries)
    collected: list[dict[str, Any]] = []
    for qi, _q in enumerate(queries):
        res = index.query(q_vecs[qi], top_k_per_query)
        ids = res.get("ids") or []
        doc_rows = res.get("documents") or []
        metas = res.get("metadatas") or []
        dists = res.get("distances") or []
        for i, rid in enumerate(ids):
            collected.append(
                {
                    "chunk_id": str(rid),
                    "text": str(doc_rows[i]) if i < len(doc_rows) else "",
                    "score": 1.0 - float(dists[i]) if i < len(dists) else 0.0,
                    "metadata": dict(metas[i]) if i < len(metas) else {},
                }
            )
    best: dict[str, dict[str, Any]] = {}
    for h in collected:
        cid = str(h["chunk_id"])
        prev = best.get(cid)
        if prev is None or float(h.get("score", 0)) > float(prev.get("score", 0)):
            best[cid] = h
    merged = sorted(best.values(), key=lambda x: float(x.get("score", 0)), reverse=True)
    cap = top_k_per_query * max(1, len(queries))
    return attach_ast_metadata(merged[:cap], ast_map, cm)


def run_retrieval_for_hydrate(
    *,
    repo_root: str,
    matches: list[dict[str, Any]],
    queries: list[str],
    top_k_per_query: int,
    conflict_regions: list[dict[str, Any]] | None = None,
    env: dict[str, str] | None = None,
    vector_cache_path: str = "",
    vector_cache_mode: str = "",
    vector_cache_diagnostics: dict[str, str] | None = None,
    vector_cache_warnings_out: list[dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    env = env or dict(os.environ)
    backend = (env.get("TONIC_RETRIEVAL_BACKEND") or "memory").strip().lower()
    from tonic.hydration.embedding_provider import resolve_embedding_provider

    embedder = resolve_embedding_provider(env)
    if backend == "chroma":
        return run_chroma_retrieval_for_hydrate(
            repo_root=repo_root,
            matches=matches,
            queries=queries,
            top_k_per_query=top_k_per_query,
            conflict_regions=conflict_regions,
            embedder=embedder,
            env=env,
        )
    return run_memory_retrieval_for_hydrate(
        repo_root=repo_root,
        matches=matches,
        queries=queries,
        top_k_per_query=top_k_per_query,
        conflict_regions=conflict_regions,
        embedder=embedder,
        env=env,
        vector_cache_path=vector_cache_path,
        vector_cache_mode=vector_cache_mode,
        vector_cache_diagnostics=vector_cache_diagnostics,
        vector_cache_warnings_out=vector_cache_warnings_out,
    )


def build_batch_code_walk_trace(
    *,
    retrieval_hits: list[dict[str, Any]],
    conflict_region_count: int,
    ast_match_count: int,
) -> dict[str, Any]:
    insights: list[str] = [
        f"Ast structural matches available: {ast_match_count}; conflict regions: {conflict_region_count}."
    ]
    for h in retrieval_hits[:8]:
        meta = h.get("metadata") or {}
        insights.append(
            f"Chunk {h.get('chunk_id')} @ {meta.get('path')} L{meta.get('start_line')}-{meta.get('end_line')} "
            f"score={float(h.get('score', 0)):.4f}"
        )
    steps = [
        {
            "tool": "batch_context",
            "outcome": {
                "chunks": [
                    {
                        "filePath": str((h.get("metadata") or {}).get("path", "")),
                        "snippet": str(h.get("text", ""))[:600],
                        "symbol": str((h.get("metadata") or {}).get("ast_rule_id", "")) or None,
                        "relevance": float(h.get("score", 0)),
                    }
                    for h in retrieval_hits[:12]
                ],
                "insights": insights,
            },
        }
    ]
    return {
        "schema": "tonic-code-walk-trace",
        "version": "1",
        "plan": [{"id": "batch-1", "goal": "Summarize retrieval + structural context", "mode": "deterministic"}],
        "steps": steps,
    }
