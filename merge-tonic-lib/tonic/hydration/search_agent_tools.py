"""Lexical filters over retrieval hits (parity with @mergetonic/coding-hydration tools)."""

from __future__ import annotations

import re
from typing import Any


def regex_search_hits(hits: list[dict[str, Any]], pattern: str) -> list[dict[str, Any]]:
    try:
        rx = re.compile(pattern, re.IGNORECASE)
    except re.error:
        return []
    return [h for h in hits if rx.search(str(h.get("text", "")))]


def symbol_search_hits(hits: list[dict[str, Any]], symbol: str) -> list[dict[str, Any]]:
    s = symbol.strip().lower()
    if not s:
        return list(hits)
    out: list[dict[str, Any]] = []
    for h in hits:
        meta = h.get("metadata") if isinstance(h.get("metadata"), dict) else {}
        rule = str(meta.get("ast_rule_id", "")).lower()
        sym = str(meta.get("symbol", "")).lower()
        if s in rule or s in sym:
            out.append(h)
    return out
