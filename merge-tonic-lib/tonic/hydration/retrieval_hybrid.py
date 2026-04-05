"""Post-dense hybrid / symbol stage (parity with applyRetrievalHybridStage)."""

from __future__ import annotations

import re
from typing import Any


def _regex_hits(hits: list[dict[str, Any]], pattern: str) -> list[dict[str, Any]]:
    try:
        rx = re.compile(pattern, re.IGNORECASE)
    except re.error:
        return []
    return [h for h in hits if rx.search(str(h.get("text") or ""))]


def _symbol_hits(hits: list[dict[str, Any]], symbol: str) -> list[dict[str, Any]]:
    s = symbol.strip().lower()
    if not s:
        return hits
    out: list[dict[str, Any]] = []
    for h in hits:
        meta = h.get("metadata") or {}
        if not isinstance(meta, dict):
            continue
        rule = str(meta.get("ast_rule_id") or "").lower()
        sym = str(meta.get("symbol") or "").lower()
        if s in rule or s in sym:
            out.append(h)
    return out


def reciprocal_rank_fusion(a: list[dict[str, Any]], b: list[dict[str, Any]], k: int = 60) -> list[dict[str, Any]]:
    scores: dict[str, float] = {}
    by_id: dict[str, dict[str, Any]] = {}

    def add(lst: list[dict[str, Any]], weight: float) -> None:
        for i, hit in enumerate(lst):
            cid = str(hit.get("chunk_id") or "")
            if not cid:
                continue
            by_id[cid] = hit
            scores[cid] = scores.get(cid, 0.0) + weight / (k + i + 1)

    add(a, 2.0)
    add(b, 1.0)
    ordered = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [{**by_id[cid], "score": sc} for cid, sc in ordered if cid in by_id]


def apply_retrieval_hybrid_stage(
    dense_hits: list[dict[str, Any]],
    *,
    regex_pattern: str | None = None,
    symbol_filter: str | None = None,
) -> list[dict[str, Any]]:
    hits = list(dense_hits)
    pat = (regex_pattern or "").strip()
    if pat:
        sparse = _regex_hits(hits, pat)
        hits = reciprocal_rank_fusion(hits, sparse)
    sym = (symbol_filter or "").strip()
    if sym:
        boosted = _symbol_hits(hits, sym)
        if not boosted:
            return hits
        boosted_ids = {id(h) for h in boosted}
        rest = [h for h in hits if id(h) not in boosted_ids]
        return boosted + rest
    return hits
