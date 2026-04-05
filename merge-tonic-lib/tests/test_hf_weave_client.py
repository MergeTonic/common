from __future__ import annotations

import os

from tonic.hf_weave.client import hub_upload_download_plan, redact_token


def test_redact_token() -> None:
    os.environ["HF_TOKEN"] = "secret123"
    assert "***" in redact_token("bearer secret123 for hub")


def test_hub_offline_roundtrip() -> None:
    os.environ["HF_HUB_OFFLINE"] = "1"
    _, got = hub_upload_download_plan(key="k", data=b"abc")
    assert got == b"abc"
