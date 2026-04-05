from __future__ import annotations

import hashlib


def normalize_lf(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def canonical_text_lines(text: str) -> list[str]:
    """LF-normalized text split into lines; matches verify_path_local / manifest hashing."""
    norm = normalize_lf(text)
    lines = norm.split("\n") if norm else []
    if lines and lines[-1] == "":
        lines = lines[:-1]
    return lines


def sha256_hex_utf8(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_hex_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
