from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from tonic.hf_weave.ctrd import build_ctrd_document, ctrd_document_json, ctrd_id_from_payload
from tonic.hf_weave.hub_index import merge_hub_index_lww, parse_hub_index


def test_merge_hub_index_lww_prefers_newer_updated_at() -> None:
    a = parse_hub_index(
        '{"schema":"tonic-weave-hub-index","version":"1","repo_id":"u/m","objects":{"k1":{"sha256":"k1","size_bytes":1,"updated_at":"2020-01-01T00:00:00Z"}}}'
    )
    b = parse_hub_index(
        '{"schema":"tonic-weave-hub-index","version":"1","repo_id":"u/m","objects":{"k1":{"sha256":"k1","size_bytes":2,"updated_at":"2021-01-01T00:00:00Z"}}}'
    )
    m = merge_hub_index_lww(a, b)
    assert m["objects"]["k1"]["size_bytes"] == 2


def test_ctrd_id_stable() -> None:
    cid, doc = build_ctrd_document(
        manifest_commit="abc",
        path="f.txt",
        steps=[{"commit": "c1", "lines": ["a"]}],
        diff_engine_id="tonic-v1",
        weave_format_version="1",
    )
    raw = ctrd_document_json(doc)
    assert doc["ctrd_id"] == cid
    assert len(cid) == 64
    # ctrd_id matches hash of payload without ctrd_id field
    from tonic.hf_weave.ctrd import canonical_ctrd_payload_for_hash

    body = canonical_ctrd_payload_for_hash(
        manifest_commit="abc",
        path="f.txt",
        steps=[{"commit": "c1", "lines": ["a"]}],
        diff_engine_id="tonic-v1",
        weave_format_version="1",
    )
    assert ctrd_id_from_payload(body) == cid


def test_refresh_weave_hub_index_offline(tmp_path: Path) -> None:
    import os

    from tonic.hf_weave.hub_index import refresh_weave_hub_index

    (tmp_path / ".tonic" / "weave").mkdir(parents=True)
    man = {
        "schema": "tonic-git-manifest",
        "version": "1",
        "commit": "0" * 40,
        "paths": {
            "a.txt": {
                "text_blob_sha": "a" * 64,
                "weave_serialized_sha": "b" * 64,
                "weave_format_version": "1",
                "diff_engine_id": "tonic-v1",
            }
        },
    }
    (tmp_path / ".tonic" / "weave" / "manifest.json").write_text(json.dumps(man), encoding="utf-8")
    (tmp_path / ".tonic" / "weave" / "blobs").mkdir(parents=True)
    (tmp_path / ".tonic" / "weave" / "blobs" / ("b" * 64)).write_bytes(b"x")

    with patch.dict(os.environ, {"HF_HUB_OFFLINE": "1"}, clear=False):
        idx = refresh_weave_hub_index(tmp_path, "u/m", offline=True)
    assert "b" * 64 in idx.get("objects", {})
