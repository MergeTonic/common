"""CTRD build / publish / fetch with Hub I/O mocked to in-memory storage."""

from __future__ import annotations

from unittest.mock import patch

from tonic.hf_weave.ctrd import (
    build_ctrd_document,
    ctrd_id_from_payload,
    fetch_ctrd_from_hub,
    publish_ctrd_to_hub,
)


def test_ctrd_roundtrip_in_memory_store() -> None:
    store: dict[str, bytes] = {}

    def fake_upload(*, repo_id: str, path_in_repo: str, data: bytes, commit_message: str = "") -> None:
        _ = repo_id
        _ = commit_message
        store[path_in_repo] = data

    def fake_download(*, repo_id: str, path_in_repo: str) -> bytes | None:
        _ = repo_id
        return store.get(path_in_repo)

    steps = [{"commit": "c1", "lines": ["a"]}, {"commit": "c2", "lines": ["a", "b"]}]
    cid, doc = build_ctrd_document(
        manifest_commit="deadbeef",
        path="p.ts",
        steps=steps,
        diff_engine_id="tonic-v1",
        weave_format_version="1",
        expected_weave_serialized_sha="abc" * 10 + "ab",
    )
    assert len(cid) == 64
    assert doc["ctrd_id"] == cid

    with (
        patch("tonic.hf_weave.ctrd.hub_offline", return_value=False),
        patch("tonic.hf_weave.client.hub_upload_bytes", side_effect=fake_upload),
        patch("tonic.hf_weave.client.hub_download_repo_path", side_effect=fake_download),
    ):
        out = publish_ctrd_to_hub(repo_id="r/x", doc=doc, offline=False)
        assert out == cid
        got = fetch_ctrd_from_hub(repo_id="r/x", ctrd_id=cid, offline=False)
        assert got is not None
        assert got.get("ctrd_id") == cid
        assert got.get("steps") == steps


def test_ctrd_id_stable() -> None:
    body = {
        "schema": "tonic-weave-trace-replay",
        "version": "1",
        "manifest_commit": "m",
        "path": "f",
        "steps": [],
        "diff_engine_id": "tonic-v1",
        "weave_format_version": "1",
    }
    a = ctrd_id_from_payload(body)
    b = ctrd_id_from_payload(body)
    assert a == b
    assert len(a) == 64
