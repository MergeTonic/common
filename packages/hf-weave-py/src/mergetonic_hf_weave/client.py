from __future__ import annotations

import os

from tonic.hf_weave.client import hub_upload_download_plan, redact_token as tonic_redact_token


def redact_token(msg: str) -> str:
    return tonic_redact_token(msg)


def offline_mode() -> bool:
    return os.environ.get("HF_HUB_OFFLINE", "").lower() in ("1", "true", "yes")


def put_get_roundtrip(key: str, data: bytes) -> bytes:
    """Delegates to ``tonic.hf_weave.client.hub_upload_download_plan`` (offline memory or Hub)."""
    _, got = hub_upload_download_plan(key=key, data=data)
    return got
