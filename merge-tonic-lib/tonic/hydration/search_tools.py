"""Agentic search helpers mirroring cookbook code-search tool capabilities."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import re

from .embedder import Embedder
from .repository import HydrationRepository
from .vector_index import VectorFilter, VectorIndex, VectorSearchResult


@dataclass(frozen=True)
class CodeSearchRecord:
    code: str
    file_path: str
    chunk_id: str
    source: str
    score: float
    symbol: str = ""
    start_line: int | None = None
    end_line: int | None = None


def _metadata_to_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    return ""


def _metadata_to_number(value: object) -> int | None:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            parsed = float(value.strip())
            if parsed.is_integer():
                return int(parsed)
        except Exception:
            return None
    return None


def _escape_regex(value: str) -> str:
    return re.escape(value)


def _line_from_offset(content: str, offset: int) -> int:
    if offset <= 0:
        return 1
    return content[:offset].count("\n") + 1


def _excerpt_for_line(content: str, line: int, radius: int = 2) -> str:
    lines = content.splitlines()
    start = max(0, line - 1 - radius)
    end = min(len(lines), line + radius)
    return "\n".join(lines[start:end])


def _synthetic_chunk_id(parts: list[str]) -> str:
    digest = hashlib.sha256("\x1e".join(parts).encode("utf-8", errors="replace")).hexdigest()[:16]
    return f"synthetic:{digest}"


_SYMBOL_STOPWORDS = {
    "which",
    "files",
    "modules",
    "symbols",
    "implement",
    "affect",
    "intent",
    "this",
    "that",
    "with",
    "from",
    "into",
    "about",
    "what",
    "where",
    "when",
    "does",
    "work",
    "current",
    "branch",
    "context",
    "hydrate",
    "hydration",
}


def extract_symbol_candidates(question: str, max_candidates: int = 3) -> list[str]:
    out: list[str] = []

    def add(value: str) -> None:
        token = value.replace("(", "").replace(")", "").strip()
        if not token or len(token) < 3:
            return
        if token.lower() in _SYMBOL_STOPWORDS:
            return
        if token in out:
            return
        out.append(token)

    for match in re.finditer(r"`([A-Za-z_$][A-Za-z0-9_$]*)`", question):
        add(match.group(1))
    for match in re.finditer(r"\b(?:function|class|method|symbol|module)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b", question, re.IGNORECASE):
        add(match.group(1))
    for match in re.finditer(r"\b[A-Za-z_$][A-Za-z0-9_$]*\b", question):
        token = match.group(0)
        if re.search(r"[A-Z_]", token) or re.match(r"^[a-z]+[A-Z][A-Za-z0-9_$]*$", token):
            add(token)
        if len(out) >= max_candidates:
            break
    return out[:max_candidates]


def extract_regex_candidates(question: str, max_candidates: int = 2) -> list[str]:
    out: list[str] = []
    for match in re.finditer(r'"([^"]{3,})"|\'([^\']{3,})\'', question):
        raw = (match.group(1) or match.group(2) or "").strip()
        if not raw:
            continue
        escaped = _escape_regex(raw)
        if escaped not in out:
            out.append(escaped)
        if len(out) >= max_candidates:
            break
    return out[:max_candidates]


def _to_semantic_record(hit: VectorSearchResult) -> CodeSearchRecord | None:
    metadata = hit.metadata or {}
    file_path = _metadata_to_text(metadata.get("path"))
    if not file_path:
        return None
    return CodeSearchRecord(
        code=hit.document,
        file_path=file_path,
        chunk_id=_metadata_to_text(metadata.get("chunk_id")) or hit.id,
        source="semantic",
        score=float(hit.score),
        symbol=_metadata_to_text(metadata.get("symbol")),
        start_line=_metadata_to_number(metadata.get("start_line")),
        end_line=_metadata_to_number(metadata.get("end_line")),
    )


def semantic_search_records(
    *,
    index: VectorIndex,
    embedder: Embedder,
    query: str,
    num_results: int,
    filter: VectorFilter | None = None,
) -> list[CodeSearchRecord]:
    embedding = embedder.embed_query(query)
    hits = index.similarity_search(embedding, num_results, filter=filter)
    records: list[CodeSearchRecord] = []
    for hit in hits:
        record = _to_semantic_record(hit)
        if record is not None:
            records.append(record)
    return records


def _tokenize_lexical_query(query: str) -> list[str]:
    tokens = [token.strip() for token in re.split(r"[^a-zA-Z0-9_$]+", query.lower()) if token.strip()]
    return list(dict.fromkeys([token for token in tokens if len(token) >= 2]))[:24]


def _count_token_hits(haystack: str, token: str) -> int:
    pattern = re.compile(rf"\b{re.escape(token)}\b", re.IGNORECASE)
    return len(pattern.findall(haystack))


def lexical_search_records(*, repository: HydrationRepository, query: str, num_results: int) -> list[CodeSearchRecord]:
    tokens = _tokenize_lexical_query(query)
    if not tokens:
        return []
    records: list[CodeSearchRecord] = []
    for file in repository.read_indexable_files():
        normalized = file.content.lower()
        total_hits = 0
        first_offset = -1
        for token in tokens:
            total_hits += _count_token_hits(normalized, token)
            if first_offset < 0:
                pos = normalized.find(token)
                if pos >= 0:
                    first_offset = pos
        if total_hits <= 0:
            continue
        start_line = _line_from_offset(file.content, max(0, first_offset))
        snippet = _excerpt_for_line(file.content, start_line, radius=3)
        normalized_score = min(1.0, float(total_hits) / max(1.0, float(len(tokens))))
        records.append(
            CodeSearchRecord(
                code=snippet or file.content[:400],
                file_path=file.relative_path,
                chunk_id=_synthetic_chunk_id([file.relative_path, "lexical", ",".join(tokens)]),
                source="lexical",
                score=normalized_score,
                start_line=start_line,
                end_line=start_line + max(0, snippet.count("\n")),
            )
        )
    return sorted(records, key=lambda item: item.score, reverse=True)[:num_results]


def hybrid_search_records(
    *,
    index: VectorIndex,
    embedder: Embedder,
    repository: HydrationRepository,
    dense_query: str,
    sparse_query: str,
    num_results: int,
    dense_weight: float = 2.0,
    sparse_weight: float = 1.0,
    filter: VectorFilter | None = None,
) -> list[CodeSearchRecord]:
    rrf_k = 60
    dense = semantic_search_records(
        index=index,
        embedder=embedder,
        query=dense_query,
        num_results=max(num_results * 2, num_results),
        filter=filter,
    )
    sparse = lexical_search_records(
        repository=repository,
        query=sparse_query,
        num_results=max(num_results * 2, num_results),
    )

    dense_rank: dict[str, int] = {}
    for index_pos, record in enumerate(dense):
        dense_rank[f"{record.file_path}\x1e{record.chunk_id}"] = index_pos + 1
    sparse_rank: dict[str, int] = {}
    for index_pos, record in enumerate(sparse):
        sparse_rank[f"{record.file_path}\x1e{record.chunk_id}"] = index_pos + 1

    all_records: dict[str, CodeSearchRecord] = {}
    for record in dense:
        all_records[f"{record.file_path}\x1e{record.chunk_id}"] = record
    for record in sparse:
        key = f"{record.file_path}\x1e{record.chunk_id}"
        if key not in all_records:
            all_records[key] = record

    fused: list[CodeSearchRecord] = []
    for key, record in all_records.items():
        dr = dense_rank.get(key)
        sr = sparse_rank.get(key)
        score = (dense_weight * (1.0 / (rrf_k + dr)) if dr else 0.0) + (
            sparse_weight * (1.0 / (rrf_k + sr)) if sr else 0.0
        )
        fused.append(
            CodeSearchRecord(
                code=record.code,
                file_path=record.file_path,
                chunk_id=record.chunk_id,
                source="hybrid",
                score=score if score > 0 else record.score,
                symbol=record.symbol,
                start_line=record.start_line,
                end_line=record.end_line,
            )
        )
    return sorted(fused, key=lambda item: item.score, reverse=True)[:num_results]


def regex_search_records(*, repository: HydrationRepository, pattern: str, num_results: int) -> list[CodeSearchRecord]:
    compiled = re.compile(pattern, re.MULTILINE)
    out: list[CodeSearchRecord] = []
    for file in repository.read_indexable_files():
        for match in compiled.finditer(file.content):
            start_line = _line_from_offset(file.content, match.start())
            snippet = _excerpt_for_line(file.content, start_line)
            out.append(
                CodeSearchRecord(
                    code=snippet or match.group(0),
                    file_path=file.relative_path,
                    chunk_id=_synthetic_chunk_id([file.relative_path, str(start_line), pattern, "regex"]),
                    source="regex",
                    score=0.7,
                    start_line=start_line,
                    end_line=start_line + max(0, snippet.count("\n")),
                )
            )
            if len(out) >= num_results:
                return out
    return out


def symbol_search_records(*, repository: HydrationRepository, symbol_name: str, num_results: int) -> list[CodeSearchRecord]:
    escaped = _escape_regex(symbol_name)
    pattern = re.compile(
        "|".join(
            [
                rf"\b(?:class|interface|enum|type|function)\s+{escaped}\b",
                rf"\b(?:const|let|var)\s+{escaped}\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][A-Za-z0-9_$]*\s*=>)",
                rf"^\s*(?:public|private|protected|static|readonly|async|get|set|\s)*{escaped}\s*\([^)]*\)\s*\{{",
            ]
        ),
        re.MULTILINE,
    )
    out: list[CodeSearchRecord] = []
    for file in repository.read_indexable_files():
        for match in pattern.finditer(file.content):
            start_line = _line_from_offset(file.content, match.start())
            snippet = _excerpt_for_line(file.content, start_line)
            out.append(
                CodeSearchRecord(
                    code=snippet or match.group(0),
                    file_path=file.relative_path,
                    chunk_id=_synthetic_chunk_id([file.relative_path, str(start_line), symbol_name, "symbol"]),
                    source="symbol",
                    score=0.9,
                    symbol=symbol_name,
                    start_line=start_line,
                    end_line=start_line + max(0, snippet.count("\n")),
                )
            )
            if len(out) >= num_results:
                return out
    return out


def list_files(*, repository: HydrationRepository, max_files: int = 2000) -> list[str]:
    return repository.list_indexable_paths()[:max_files]


def get_file_content(*, repository: HydrationRepository, file_path: str) -> str | None:
    normalized = file_path.replace("\\", "/").lstrip("/")
    for file in repository.read_indexable_files():
        if file.relative_path == normalized:
            return file.content
    return None


def merge_search_records(records: list[CodeSearchRecord], limit: int) -> list[CodeSearchRecord]:
    out: list[CodeSearchRecord] = []
    seen: set[str] = set()
    ordered = sorted(records, key=lambda item: item.score, reverse=True)
    for record in ordered:
        key = f"{record.file_path}\x1e{record.chunk_id}"
        if key in seen:
            continue
        seen.add(key)
        out.append(record)
        if len(out) >= limit:
            break
    return out
