"""Compact AST match list for question-refinement templates (parity with astRefinementExcerpt.ts)."""

from __future__ import annotations

import json
from typing import Any

DEFAULT_MAX_MATCHES = 40
DEFAULT_MAX_MESSAGE_LEN = 240


def format_ast_matches_excerpt_json(ast: dict[str, Any] | None, env: dict[str, str]) -> str:
    if not ast:
        return "[]"
    matches = list(ast.get("matches") or [])
    if not matches:
        return "[]"
    max_matches = max(
        1,
        int((env.get("TONIC_AST_REFINEMENT_MAX_MATCHES") or "").strip() or "0") or DEFAULT_MAX_MATCHES,
    )
    max_msg = max(
        32,
        int((env.get("TONIC_AST_REFINEMENT_MAX_MESSAGE_LEN") or "").strip() or "0") or DEFAULT_MAX_MESSAGE_LEN,
    )
    slice_ = matches[:max_matches]
    brief: list[dict[str, Any]] = []
    for m in slice_:
        if not isinstance(m, dict):
            continue
        start = m.get("start") if isinstance(m.get("start"), dict) else {}
        line = start.get("line") if isinstance(start, dict) else None
        msg = str(m.get("message") or "")
        brief.append(
            {
                "path": m.get("path"),
                "rule_id": m.get("rule_id"),
                "message": msg[:max_msg],
                "line": line,
            }
        )
    return json.dumps(brief, indent=2)
