"""Optional on-disk memory vector index snapshot (parity with TS memoryVectorSnapshot)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Literal

from tonic.hydration.ast_grep_chunker import chunks_from_ast_artifact
from tonic.hydration.embedding_fingerprint import embedding_fingerprint_from_env
from tonic.hydration.embedding_provider import EmbeddingProvider

VectorCacheMode = Literal["off", "read", "write", "readwrite"]


def content_digest_utf8(document: str) -> str:
    return hashlib.sha256(document.encode("utf-8")).hexdigest()


def resolve_vector_cache_options(
    env: dict[str, str],
    *,
    path_override: str = "",
    mode_override: str = "",
) -> tuple[str, VectorCacheMode]:
    p = (path_override or env.get("TONIC_VECTOR_CACHE_PATH") or "").strip()
    raw = (mode_override or env.get("TONIC_VECTOR_CACHE_MODE") or "").strip().lower()
    if not p:
        return "", "off"
    if raw == "off":
        return p, "off"
    if raw == "read":
        return p, "read"
    if raw == "write":
        return p, "write"
    if raw in ("readwrite", "read-write"):
        return p, "readwrite"
    return p, "readwrite"


def _parse_snapshot(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    if raw.get("schema") != "tonic-memory-vector-index" or raw.get("version") != "1":
        return None
    fp = raw.get("embedding_fingerprint")
    if not isinstance(fp, str) or not fp.strip():
        return None
    recs = raw.get("records")
    if not isinstance(recs, list):
        return None
    records: list[dict[str, Any]] = []
    for r in recs:
        if not isinstance(r, dict):
            continue
        rid = r.get("id")
        doc = r.get("document")
        emb = r.get("embedding")
        meta = r.get("metadata")
        cd = r.get("content_digest")
        if not isinstance(rid, str) or not isinstance(doc, str) or not isinstance(cd, str):
            continue
        if not isinstance(emb, list) or not emb:
            continue
        try:
            vec = [float(x) for x in emb]
        except (TypeError, ValueError):
            continue
        records.append(
            {
                "id": rid,
                "document": doc,
                "embedding": vec,
                "metadata": dict(meta) if isinstance(meta, dict) else {},
                "content_digest": cd,
            }
        )
    out: dict[str, Any] = {
        "schema": "tonic-memory-vector-index",
        "version": "1",
        "embedding_fingerprint": fp.strip(),
        "records": records,
    }
    ed = raw.get("embedding_dim")
    if isinstance(ed, int) and ed > 0:
        out["embedding_dim"] = ed
    if raw.get("digest_algorithm") == "sha256":
        out["digest_algorithm"] = "sha256"
    if isinstance(raw.get("ruleset_hash"), str):
        out["ruleset_hash"] = raw["ruleset_hash"]
    if isinstance(raw.get("repo_head"), str):
        out["repo_head"] = raw["repo_head"]
    return out


def load_memory_vector_index_from_path(file_path: str | Path) -> dict[str, Any] | None:
    p = Path(file_path).resolve()
    if not p.is_file():
        return None
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return _parse_snapshot(raw)


def save_memory_vector_index_to_path(file_path: str | Path, artifact: dict[str, Any]) -> None:
    p = Path(file_path).resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    body = {**artifact, "digest_algorithm": artifact.get("digest_algorithm") or "sha256"}
    p.write_text(json.dumps(body) + "\n", encoding="utf-8")


def build_vector_records_with_cache(
    *,
    repo_root: str,
    matches: list[dict[str, Any]],
    embedder: EmbeddingProvider,
    env: dict[str, str],
    cache_path: str,
    cache_mode: VectorCacheMode,
    diagnostics: dict[str, str] | None = None,
    warnings_out: list[dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    chunks = chunks_from_ast_artifact(repo_root, matches)
    if not chunks:
        return []

    probe = embedder.embed_batch([" "])
    expected_dim = len(probe[0]) if probe else 0
    if expected_dim <= 0:
        raise RuntimeError("Vector cache: embedder returned empty dimension probe")

    fp = embedding_fingerprint_from_env(env)
    snapshot: dict[str, Any] | None = None

    if cache_mode in ("read", "readwrite"):
        snapshot = load_memory_vector_index_from_path(cache_path)
        if snapshot is None:
            if warnings_out is not None:
                warnings_out.append(
                    {
                        "code": "vector_cache_missing",
                        "message": f"No valid snapshot at {cache_path}; embedded all chunks.",
                    }
                )
        elif snapshot.get("embedding_fingerprint") != fp:
            if warnings_out is not None:
                warnings_out.append(
                    {
                        "code": "vector_cache_fingerprint_mismatch",
                        "message": "Snapshot embedding_fingerprint does not match current embedder; re-embedded all chunks.",
                    }
                )
            snapshot = None
        else:
            sed = snapshot.get("embedding_dim")
            if isinstance(sed, int) and sed > 0 and sed != expected_dim:
                if warnings_out is not None:
                    warnings_out.append(
                        {
                            "code": "vector_cache_dim_mismatch",
                            "message": f"Snapshot embedding_dim {sed} != current {expected_dim}; re-embedded all chunks.",
                        }
                    )
                snapshot = None

    by_id: dict[str, dict[str, Any]] = {}
    if snapshot:
        for r in snapshot.get("records") or []:
            if isinstance(r, dict) and isinstance(r.get("id"), str):
                by_id[str(r["id"])] = r

    docs = [f"{c['path']}\n{c['text']}" for c in chunks]
    embeddings: list[list[float] | None] = [None] * len(chunks)
    need_index: list[int] = []

    for i, c in enumerate(chunks):
        mid = c.get("ast_match_id") or f"chunk-{i}"
        cid = str(mid)
        doc = docs[i]
        digest = content_digest_utf8(doc)
        prev = by_id.get(cid)
        emb_ok = (
            isinstance(prev, dict)
            and prev.get("content_digest") == digest
            and isinstance(prev.get("embedding"), list)
            and len(prev["embedding"]) == expected_dim
        )
        if emb_ok:
            embeddings[i] = [float(x) for x in prev["embedding"]]
        else:
            need_index.append(i)

    if cache_mode == "write":
        need_index = list(range(len(chunks)))
        embeddings = [None] * len(chunks)

    if need_index:
        to_embed = [docs[i] for i in need_index]
        fresh = embedder.embed_batch(to_embed)
        for j, idx in enumerate(need_index):
            embeddings[idx] = fresh[j]

    records: list[dict[str, Any]] = []
    for i, c in enumerate(chunks):
        mid = c.get("ast_match_id") or f"chunk-{i}"
        vec = embeddings[i]
        if vec is None:
            raise RuntimeError("Embedding dimension mismatch after cache merge")
        records.append(
            {
                "id": str(mid),
                "document": docs[i],
                "embedding": vec,
                "metadata": {
                    "path": c["path"],
                    "start_line": c["start_line"],
                    "end_line": c["end_line"],
                    "source": "memory",
                    "ast_rule_id": c.get("ast_rule_id"),
                    "ast_match_id": c.get("ast_match_id"),
                },
            }
        )

    if cache_mode in ("write", "readwrite"):
        try:
            snap_out: dict[str, Any] = {
                "schema": "tonic-memory-vector-index",
                "version": "1",
                "embedding_fingerprint": fp,
                "embedding_dim": expected_dim,
                "digest_algorithm": "sha256",
                "records": [
                    {
                        "id": r["id"],
                        "document": r["document"],
                        "embedding": r["embedding"],
                        "metadata": dict(r["metadata"]),
                        "content_digest": content_digest_utf8(r["document"]),
                    }
                    for r in records
                ],
            }
            if diagnostics:
                rh = diagnostics.get("ruleset_hash", "").strip()
                if rh:
                    snap_out["ruleset_hash"] = rh
                h = diagnostics.get("repo_head", "").strip()
                if h:
                    snap_out["repo_head"] = h
            save_memory_vector_index_to_path(cache_path, snap_out)
        except OSError as e:
            if warnings_out is not None:
                warnings_out.append(
                    {
                        "code": "vector_cache_write_failed",
                        "message": f"Failed to write vector snapshot: {str(e)[:400]}",
                    }
                )

    return records
