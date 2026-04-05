"""Optional embedded Chroma client (install chromadb extra when product enables it)."""

from __future__ import annotations


class ChromaEmbeddedUnavailable(ImportError):
    pass


def assert_chroma_embedded_available() -> None:
    import importlib.util

    if importlib.util.find_spec("chromadb") is None:
        raise ChromaEmbeddedUnavailable(
            "chromadb is not installed; use memory retrieval or pip install 'merge-tonic[ai]' when wired."
        )
