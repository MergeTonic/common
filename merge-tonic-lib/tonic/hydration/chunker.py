"""Line/token estimate chunker for hydration indexing v1."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import os
import re


@dataclass(frozen=True)
class HydrationChunk:
    id: str
    path: str
    start_line: int
    end_line: int
    document: str
    estimated_tokens: int
    symbol: str = ""


def _estimate_tokens(text: str) -> int:
    trimmed = text.strip()
    if not trimmed:
        return 0
    return max(1, (len(trimmed) + 3) // 4)


def _chunk_id(path: str, start_line: int, end_line: int, document: str) -> str:
    digest = hashlib.sha256(
        f"{path}\x1e{start_line}\x1e{end_line}\x1e{document}".encode("utf-8", errors="replace")
    ).hexdigest()[:16]
    return f"{path}:{start_line}-{end_line}:{digest}"


SYMBOL_PATTERNS = [
    re.compile(r"\b(?:class|interface|enum|type|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b", re.MULTILINE),
    re.compile(r"\b(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(", re.MULTILINE),
    re.compile(
        r"\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][A-Za-z0-9_$]*\s*=>)",
        re.MULTILINE,
    ),
    re.compile(
        r"^\s*(?:public|private|protected|static|readonly|async|get|set|\s)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{",
        re.MULTILINE,
    ),
]


def _extract_primary_symbol(document: str) -> str:
    source = document.strip()
    if not source:
        return ""
    for pattern in SYMBOL_PATTERNS:
        match = pattern.search(source)
        symbol = (match.group(1).strip() if match else "")
        if symbol:
            return symbol
    return ""


@dataclass(frozen=True)
class _ChunkSegment:
    start_index: int
    end_index: int
    symbol: str = ""


_TS_DECLARATION_PATTERN = re.compile(
    r"(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|enum|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b"
    r"|(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][A-Za-z0-9_$]*\s*=>)",
    re.MULTILINE,
)

_PY_DECLARATION_PATTERN = re.compile(
    r"(?:^|\n)\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\("
    r"|(?:^|\n)\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\b",
    re.MULTILINE,
)


def _line_from_offset(content: str, offset: int) -> int:
    if offset <= 0:
        return 1
    return content[:offset].count("\n") + 1


def _collect_declaration_segments(path: str, content: str) -> list[_ChunkSegment]:
    extension = os.path.splitext(path)[1].lower()
    if extension in {".ts", ".tsx", ".js", ".jsx"}:
        pattern = _TS_DECLARATION_PATTERN
    elif extension == ".py":
        pattern = _PY_DECLARATION_PATTERN
    else:
        pattern = _PY_DECLARATION_PATTERN

    markers: list[tuple[int, str]] = []
    for match in pattern.finditer(content):
        raw = match.group(0) or ""
        symbol = (match.group(1) or match.group(2) or "").strip()
        leading_newline = 1 if raw.startswith("\n") else 0
        markers.append((match.start() + leading_newline, symbol))

    if not markers:
        return [_ChunkSegment(start_index=0, end_index=len(content))]

    markers.sort(key=lambda item: item[0])
    segments: list[_ChunkSegment] = []
    cursor = 0
    for index, (start, symbol) in enumerate(markers):
        next_start = markers[index + 1][0] if index + 1 < len(markers) else len(content)
        if cursor < start:
            segments.append(_ChunkSegment(start_index=cursor, end_index=start))
        segments.append(
            _ChunkSegment(
                start_index=start,
                end_index=max(start, next_start),
                symbol=symbol,
            )
        )
        cursor = max(cursor, next_start)
    if cursor < len(content):
        segments.append(_ChunkSegment(start_index=cursor, end_index=len(content)))
    return [segment for segment in segments if segment.end_index > segment.start_index]


class LineTokenEstimateChunker:
    version = "line-estimate-v1"

    def __init__(self, *, max_lines_per_chunk: int = 80, max_estimated_tokens: int = 600) -> None:
        self.max_lines_per_chunk = max_lines_per_chunk
        self.max_estimated_tokens = max_estimated_tokens

    def chunk_text(self, path: str, content: str) -> list[HydrationChunk]:
        chunks: list[HydrationChunk] = []
        for segment in _collect_declaration_segments(path, content):
            source = content[segment.start_index : segment.end_index]
            if not source.strip():
                continue
            start_line_offset = _line_from_offset(content, segment.start_index)
            lines = source.splitlines()
            start = 0
            while start < len(lines):
                end = start
                current_tokens = 0
                while end < len(lines):
                    candidate = "\n".join(lines[start : end + 1])
                    estimated = _estimate_tokens(candidate)
                    candidate_line_count = end - start + 1
                    if (
                        end > start
                        and (
                            candidate_line_count > self.max_lines_per_chunk
                            or estimated > self.max_estimated_tokens
                        )
                    ):
                        break
                    current_tokens = estimated
                    end += 1
                document = "\n".join(lines[start:end])
                if document:
                    start_line = start_line_offset + start
                    end_line = start_line + max(0, end - start - 1)
                    chunks.append(
                        HydrationChunk(
                            id=_chunk_id(path, start_line, end_line, document),
                            path=path,
                            start_line=start_line,
                            end_line=end_line,
                            document=document,
                            estimated_tokens=current_tokens,
                            symbol=segment.symbol or _extract_primary_symbol(document),
                        )
                    )
                start = end
        return chunks
