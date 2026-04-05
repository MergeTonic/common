from __future__ import annotations

import pytest

from tonic.hf_weave.community_pr import create_hub_pull_request


def test_create_hub_pull_request_offline(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    with pytest.raises(RuntimeError, match="offline"):
        create_hub_pull_request("u/m", title="t")
