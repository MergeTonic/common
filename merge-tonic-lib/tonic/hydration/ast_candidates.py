"""Deterministic AST candidate extraction from vendored code-search records."""

from __future__ import annotations

from typing import Protocol

from .search_tools import CodeSearchRecord
from .types import HydrationRetrievalAstCandidate, HydrationAstNodeKind


def _clamp_score(value: float, floor: float = 0.05) -> float:
    return round(max(floor, min(1.0, float(value))), 6)


def _normalize_symbol(symbol: str) -> str:
    return symbol.strip()


def _infer_node_kind(record: CodeSearchRecord) -> HydrationAstNodeKind:
    source = record.code.strip()
    if not record.symbol:
        return "module"
    if any(
        line
        for line in source.splitlines()
        if line.strip().startswith(
            (
                "class ",
                "interface ",
                "enum ",
                "type ",
                "export class ",
                "export interface ",
                "export enum ",
                "export type ",
            )
        )
    ):
        return "class"
    if any(
        line
        for line in source.splitlines()
        if line.strip().startswith(("function ", "export function ", "async def ", "def "))
    ):
        return "function"
    if "{" in source and "(" in source and ")" in source:
        return "method"
    return "function"


def _build_ast_node_id(
    *,
    file_path: str,
    node_kind: HydrationAstNodeKind,
    symbol: str = "",
    start_line: int | None = None,
    end_line: int | None = None,
) -> str:
    if node_kind == "module" or not symbol:
        return f"module:{file_path}"
    if start_line is not None or end_line is not None:
        return f"{node_kind}:{symbol}:{file_path}:{start_line or 0}-{end_line if end_line is not None else start_line or 0}"
    return f"{node_kind}:{symbol}:{file_path}"


def _push_candidate(
    bucket: dict[str, HydrationRetrievalAstCandidate],
    candidate: HydrationRetrievalAstCandidate,
) -> None:
    existing = bucket.get(candidate.ast_node_id)
    if existing is None or candidate.score > existing.score:
        bucket[candidate.ast_node_id] = candidate


def build_hydration_ast_candidates(records: list[CodeSearchRecord], limit: int = 12) -> list[HydrationRetrievalAstCandidate]:
    candidates: dict[str, HydrationRetrievalAstCandidate] = {}

    for record in records:
        _push_candidate(
            candidates,
            HydrationRetrievalAstCandidate(
                ast_node_id=_build_ast_node_id(file_path=record.file_path, node_kind="module"),
                path=record.file_path,
                score=_clamp_score(record.score * 0.45, 0.1),
                rule_id="module-path-v1",
                node_kind="module",
            ),
        )

        symbol = _normalize_symbol(record.symbol)
        if not symbol:
            continue
        node_kind = _infer_node_kind(record)
        _push_candidate(
            candidates,
            HydrationRetrievalAstCandidate(
                ast_node_id=_build_ast_node_id(
                    file_path=record.file_path,
                    node_kind=node_kind,
                    symbol=symbol,
                    start_line=record.start_line,
                    end_line=record.end_line,
                ),
                path=record.file_path,
                score=_clamp_score(record.score * (1.05 if record.source == "symbol" else 0.9), 0.2),
                rule_id="symbol-search-v1" if record.source == "symbol" else "chunk-symbol-v1",
                node_kind=node_kind,
                symbol=symbol,
                start_line=record.start_line,
                end_line=record.end_line,
            ),
        )

    return sorted(candidates.values(), key=lambda candidate: (-candidate.score, candidate.ast_node_id))[:limit]


class _HydrationCandidateLike(Protocol):
    ast_node_id: str


def extract_hydration_candidate_symbol(candidate: _HydrationCandidateLike) -> str:
    symbol = getattr(candidate, "symbol", "")
    if isinstance(symbol, str) and symbol.strip():
        return symbol.strip()
    parts = candidate.ast_node_id.split(":")
    return parts[1] if len(parts) >= 3 else ""


def infer_hydration_candidate_node_kind(candidate: _HydrationCandidateLike) -> HydrationAstNodeKind:
    node_kind = getattr(candidate, "node_kind", None)
    if node_kind is not None:
        return node_kind
    if candidate.ast_node_id.startswith("module:"):
        return "module"
    if candidate.ast_node_id.startswith("class:"):
        return "class"
    if candidate.ast_node_id.startswith("method:"):
        return "method"
    if candidate.ast_node_id.startswith("function:"):
        return "function"
    return "span"
