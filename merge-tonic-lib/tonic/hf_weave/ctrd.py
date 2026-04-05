"""CTRD (Canonical Trace Replay Descriptor) — build, hash, Hub paths."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .client import hub_offline

CTRD_SCHEMA = "tonic-weave-trace-replay"
CTRD_VERSION = "1"
TRACE_PREFIX = ".tonic/hub/traces"


def ctrd_hub_path(ctrd_id: str) -> str:
    return f"{TRACE_PREFIX}/{ctrd_id}.json"


def canonical_ctrd_payload_for_hash(
    *,
    manifest_commit: str,
    path: str,
    steps: list[dict[str, Any]],
    diff_engine_id: str,
    weave_format_version: str,
    expected_weave_serialized_sha: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "schema": CTRD_SCHEMA,
        "version": CTRD_VERSION,
        "manifest_commit": manifest_commit,
        "path": path,
        "steps": steps,
        "diff_engine_id": diff_engine_id,
        "weave_format_version": weave_format_version,
    }
    if expected_weave_serialized_sha:
        body["expected_weave_serialized_sha"] = expected_weave_serialized_sha
    return body


def ctrd_id_from_payload(body: dict[str, Any]) -> str:
    raw = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def build_ctrd_document(
    *,
    manifest_commit: str,
    path: str,
    steps: list[dict[str, Any]],
    diff_engine_id: str,
    weave_format_version: str,
    expected_weave_serialized_sha: str | None = None,
) -> tuple[str, dict[str, Any]]:
    body = canonical_ctrd_payload_for_hash(
        manifest_commit=manifest_commit,
        path=path,
        steps=steps,
        diff_engine_id=diff_engine_id,
        weave_format_version=weave_format_version,
        expected_weave_serialized_sha=expected_weave_serialized_sha,
    )
    cid = ctrd_id_from_payload(body)
    doc = {**body, "ctrd_id": cid}
    return cid, doc


def ctrd_document_json(doc: dict[str, Any]) -> str:
    return json.dumps(doc, indent=2, sort_keys=True) + "\n"


def publish_ctrd_to_hub(
    *,
    repo_id: str,
    doc: dict[str, Any],
    offline: bool | None = None,
) -> str:
    """Upload CTRD JSON to Hub; returns ctrd_id."""
    from .client import hub_upload_bytes

    if hub_offline(offline):
        return str(doc.get("ctrd_id") or "")
    cid = str(doc.get("ctrd_id") or "")
    if len(cid) != 64:
        raise ValueError("publish_ctrd_to_hub: invalid ctrd_id")
    data = ctrd_document_json(doc).encode("utf-8")
    hub_upload_bytes(repo_id=repo_id, path_in_repo=ctrd_hub_path(cid), data=data, commit_message=f"tonic ctrd {cid[:12]}…")
    return cid


def fetch_ctrd_from_hub(
    *,
    repo_id: str,
    ctrd_id: str,
    offline: bool | None = None,
) -> dict[str, Any] | None:
    from .client import hub_download_repo_path

    if hub_offline(offline):
        return None
    raw = hub_download_repo_path(repo_id=repo_id, path_in_repo=ctrd_hub_path(ctrd_id))
    if raw is None:
        return None
    data: Any = json.loads(raw.decode("utf-8"))
    return data if isinstance(data, dict) else None
