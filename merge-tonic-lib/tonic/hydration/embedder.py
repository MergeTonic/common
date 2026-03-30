"""Embedding interfaces and deterministic fake embedder for tests."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Protocol


class Embedder(Protocol):
    @property
    def model_id(self) -> str: ...

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


def _deterministic_embedding(text: str, dimensions: int) -> list[float]:
    digest = hashlib.sha256(text.encode("utf-8", errors="replace")).digest()
    values: list[float] = []
    for i in range(dimensions):
        a = digest[i % len(digest)]
        b = digest[(i + 7) % len(digest)]
        values.append((a + b) / 255.0 - 1.0)
    return values


@dataclass
class DeterministicFakeEmbedder:
    model_id: str = "deterministic-fake-v1"
    dimensions: int = 16

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [_deterministic_embedding(text, self.dimensions) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return _deterministic_embedding(text, self.dimensions)
