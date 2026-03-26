"""Chunk large markdown bodies for GitHub issue / review comment size limits."""

from __future__ import annotations

DEFAULT_MAX_CHUNK_BYTES = 55_000


def _utf8_len(s: str) -> int:
    return len(s.encode("utf-8", errors="surrogatepass"))


def _split_utf8_hard(s: str, max_bytes: int) -> list[str]:
    out: list[str] = []
    i = 0
    n = len(s)
    while i < n:
        end = i + 1
        while end <= n and _utf8_len(s[i:end]) <= max_bytes:
            end += 1
        end -= 1
        if end <= i:
            out.append(s[i : i + 1])
            i += 1
        else:
            out.append(s[i:end])
            i = end
    return out


def split_text_utf8_chunks(text: str, max_bytes: int = DEFAULT_MAX_CHUNK_BYTES) -> list[str]:
    lines = text.splitlines()
    chunks: list[str] = []
    buf: list[str] = []
    bytes_acc = 0

    def flush() -> None:
        nonlocal buf, bytes_acc
        if buf:
            chunks.append("\n".join(buf))
            buf = []
            bytes_acc = 0

    for idx, line in enumerate(lines):
        piece = line + ("\n" if idx < len(lines) - 1 else "")
        lb = _utf8_len(piece)
        if lb > max_bytes:
            flush()
            chunks.extend(_split_utf8_hard(piece, max_bytes))
            continue
        if bytes_acc + lb > max_bytes and buf:
            flush()
        buf.append(line)
        bytes_acc += lb
    flush()
    return chunks if chunks else [""]


def markdown_code_fences(
    lang: str,
    title: str,
    full_text: str,
    max_chunk_bytes: int = DEFAULT_MAX_CHUNK_BYTES,
) -> str:
    parts = split_text_utf8_chunks(full_text, max_chunk_bytes)
    if len(parts) == 1:
        body = parts[0].rstrip("\n")
        return f"{title}\n\n```{lang}\n{body}\n```"
    blocks: list[str] = [f"{title} ({len(parts)} parts):"]
    for i, p in enumerate(parts):
        body = p.rstrip("\n")
        blocks.extend(["", f"**Part {i + 1}/{len(parts)}**", "", f"```{lang}", body, "```"])
    return "\n".join(blocks)


def markdown_text_fences(title: str, full_text: str, max_chunk_bytes: int = DEFAULT_MAX_CHUNK_BYTES) -> str:
    return markdown_code_fences("text", title, full_text, max_chunk_bytes)


def continuity_footer(
    *,
    marker_branch: str | None = None,
    merge_report_artifact: str | None = None,
) -> str:
    bits: list[str] = []
    if merge_report_artifact:
        bits.append(f"workflow artifact **{merge_report_artifact}**")
    if marker_branch:
        bits.append(f"branch `{marker_branch}` (same repo paths)")
    if not bits:
        return ""
    return "\n\n_Full Tonic marker files: " + " · ".join(bits) + "._"
