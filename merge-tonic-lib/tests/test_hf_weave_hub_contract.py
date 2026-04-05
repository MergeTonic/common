from __future__ import annotations

import pytest

from tonic.hf_weave.client import BLOB_PREFIX, InMemoryBlobStore, hub_upload_download_plan


def test_blob_prefix_matches_ts_tonic_hub_constant() -> None:
    assert BLOB_PREFIX == ".tonic/hub/blobs"


def test_hub_online_plan_uses_hub_store_class(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HF_HUB_OFFLINE", raising=False)
    monkeypatch.setenv("TONIC_HF_WEAVE_REPO", "namespace/model-repo")
    monkeypatch.setattr("tonic.hf_weave.client.HF_AVAILABLE", True)
    shared = InMemoryBlobStore()
    monkeypatch.setattr("tonic.hf_weave.client.HuggingfaceHubBlobStore", lambda repo_id: shared)
    _, got = hub_upload_download_plan(key="abc", data=b"payload")
    assert got == b"payload"


def test_hub_roundtrip_failure_when_store_returns_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HF_HUB_OFFLINE", raising=False)
    monkeypatch.setenv("TONIC_HF_WEAVE_REPO", "namespace/model-repo")
    monkeypatch.setattr("tonic.hf_weave.client.HF_AVAILABLE", True)

    class EmptyStore:
        def put(self, key: str, data: bytes) -> None:
            _ = (key, data)

        def get(self, key: str) -> bytes | None:
            return None

    monkeypatch.setattr("tonic.hf_weave.client.HuggingfaceHubBlobStore", lambda repo_id: EmptyStore())
    with pytest.raises(RuntimeError, match="round-trip failed"):
        hub_upload_download_plan(key="k", data=b"x")
