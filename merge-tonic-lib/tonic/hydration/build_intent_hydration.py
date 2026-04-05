"""Merge prior artifacts into tonic-intent-hydration.v1 (parity with buildIntentHydration.ts)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from tonic.hydration.sensitive_artifact_redaction import redact_sensitive_values


def _pick_intents(boot: dict[str, Any], refine: dict[str, Any] | None) -> tuple[str, str]:
    if refine:
        mode = refine.get("mode")
        rl = refine.get("refined_left_intent")
        rr = refine.get("refined_right_intent")
        if mode != "off" and isinstance(rl, str) and isinstance(rr, str) and rl and rr:
            return rl, rr
        if isinstance(rl, str) and isinstance(rr, str) and rl and rr:
            return rl, rr
    return str(boot.get("left_intent", "")), str(boot.get("right_intent", ""))


def _ast_matches_near_conflicts(
    ast: dict[str, Any] | None, conflicts: dict[str, Any], max_per_file: int
) -> list[dict[str, Any]]:
    matches = list(ast.get("matches") or []) if ast else []
    regs = list(conflicts.get("conflict_regions") or [])
    if not matches or not regs:
        return matches[:50]

    by_file: dict[str, list[dict[str, Any]]] = {}
    for r in regs:
        if not isinstance(r, dict):
            continue
        p = str(r.get("path", ""))
        by_file.setdefault(p, []).append(r)

    scored: list[tuple[dict[str, Any], float]] = []
    for m in matches:
        if not isinstance(m, dict):
            continue
        path = str(m.get("path", ""))
        if path not in by_file:
            continue
        start = m.get("start") or {}
        line = int(start.get("line", 0)) if isinstance(start, dict) else 0
        best = float("inf")
        for reg in by_file[path]:
            mid = int(reg.get("mid_line", 0))
            d = abs(line - mid)
            if d < best:
                best = d
        scored.append((m, best))

    scored.sort(
        key=lambda x: (
            x[1],
            str(x[0].get("path", "")),
            str(x[0].get("rule_id", "")),
        )
    )
    out: list[dict[str, Any]] = []
    per_file: dict[str, int] = {}
    for m, _ in scored:
        path = str(m.get("path", ""))
        n = per_file.get(path, 0) + 1
        if n > max_per_file:
            continue
        per_file[path] = n
        out.append(m)
        if len(out) >= 80:
            break
    return out if out else matches[:50]


def build_intent_hydration(
    *,
    bootstrap: dict[str, Any],
    refinement: dict[str, Any] | None,
    conflicts: dict[str, Any] | None,
    ast: dict[str, Any] | None,
    retrieval: dict[str, Any] | None = None,
    code_walk_trace_path: str | None = None,
) -> dict[str, Any]:
    left, right = _pick_intents(bootstrap, refinement)
    links: list[dict[str, Any]] = []
    region_ids: list[str] = []

    cc = conflicts or {"conflict_regions": []}
    for r in cc.get("conflict_regions") or []:
        if not isinstance(r, dict):
            continue
        rid = r.get("region_id")
        if rid:
            region_ids.append(str(rid))
        links.append(
            {
                "id": rid,
                "type": "conflict",
                "path": str(r.get("path", "")),
                "line_start": r.get("start_line"),
                "line_end": r.get("end_line"),
                "detail": "git conflict marker region",
            }
        )

    empty_cc = {"conflict_regions": []}
    near = _ast_matches_near_conflicts(ast, conflicts or empty_cc, 5)
    for i, m in enumerate(near, start=1):
        start = m.get("start") or {}
        end = m.get("end") or {}
        ls = start.get("line") if isinstance(start, dict) else None
        le = end.get("line") if isinstance(end, dict) else None
        links.append(
            {
                "id": f"ast-{i}",
                "type": "ast_match",
                "path": str(m.get("path", "")),
                "line_start": ls,
                "line_end": le,
                "detail": str(m.get("rule_id", "")),
            }
        )

    max_retrieval_links = 25
    if retrieval and isinstance(retrieval.get("hits"), list):
        for j, h in enumerate(retrieval["hits"][:max_retrieval_links]):
            if not isinstance(h, dict):
                continue
            meta = h.get("metadata") or {}
            p = str(meta.get("path", ""))
            ls = meta.get("start_line")
            le = meta.get("end_line")
            sc = h.get("score")
            detail = f"score={float(sc):.4f}" if isinstance(sc, (int, float)) else "score=?"
            if meta.get("ast_boost_applied") is True:
                detail += " ast_boost_applied=true"
            near = meta.get("nearest_conflict_region_id")
            if isinstance(near, str) and near.strip():
                detail += f" nearest_conflict_region_id={near.strip()}"
            links.append(
                {
                    "id": f"retrieval-{h.get('chunk_id', j)}",
                    "type": "retrieval_hit",
                    "path": p,
                    "line_start": int(ls) if isinstance(ls, int) else None,
                    "line_end": int(le) if isinstance(le, int) else None,
                    "detail": detail,
                }
            )

    if code_walk_trace_path:
        links.append(
            {
                "id": "code-walk-trace",
                "type": "code_walk",
                "path": code_walk_trace_path.replace("\\", "/"),
                "detail": "tonic-code-walk-trace.v1",
            }
        )

    sub_excerpt = ""
    if refinement and isinstance(refinement.get("subquestions"), list):
        sq = refinement["subquestions"]
        texts = [str(x.get("text", "")) for x in sq if isinstance(x, dict)]
        if texts:
            sub_excerpt = "Subquestions: " + " | ".join(texts) + "\n"

    excerpt = (
        f"Intents — left: {left}\n"
        f"Intents — right: {right}\n"
        f"{sub_excerpt}"
        f"Evidence links: {len(links)}"
    )

    links.sort(
        key=lambda x: (
            str(x.get("type", "")),
            str(x.get("path", "")),
            str(x.get("id", "") or ""),
        )
    )

    out: dict[str, Any] = {
        "schema": "tonic-intent-hydration",
        "version": "1",
        "left_intent": left,
        "right_intent": right,
        "truncation_policy_version": "1",
        "token_budget_hint": 8000,
        "evidence_links": links,
        "prompt_excerpt": excerpt,
    }
    if region_ids:
        out["conflict_region_ids"] = region_ids
    return out


def write_intent_hydration(path_out: str, art: dict[str, Any]) -> None:
    p = Path(path_out).resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(redact_sensitive_values(art), indent=2) + "\n", encoding="utf-8")
