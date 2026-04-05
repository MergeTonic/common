"""GET /pulls/{n} helper."""

from __future__ import annotations

from unittest.mock import patch

from tonic_agent.github_api import get_pull_request


def test_get_pull_request_delegates_to_get_json() -> None:
    payload = {"number": 42, "base": {"sha": "b1"}, "head": {"sha": "h1"}}
    with patch("tonic_agent.github_api.get_json", return_value=payload) as m:
        out = get_pull_request("acme", "demo", 42, "tok")
    assert out == payload
    m.assert_called_once()
    assert "/repos/acme/demo/pulls/42" in m.call_args[0][0]
