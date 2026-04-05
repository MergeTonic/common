"""PR resolution when webhook lacks pull_request (issue_comment)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from tonic_agent.__main__ import _resolve_pr_for_agent


def test_resolve_prefers_event_pull_request() -> None:
    pr = {"number": 1, "title": "t", "base": {"sha": "a", "ref": "main"}, "head": {"sha": "b", "ref": "f"}}
    out = _resolve_pr_for_agent({"pull_request": pr}, "o", "r", "tok")
    assert out == pr


def test_resolve_reads_tonic_pull_json(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    p = tmp_path / "pull.json"
    p.write_text('{"number": 7, "title": "from file"}', encoding="utf-8")
    monkeypatch.setenv("TONIC_PULL_REQUEST_JSON", str(p))
    monkeypatch.delenv("GITHUB_EVENT_PATH", raising=False)
    out = _resolve_pr_for_agent({"issue": {"number": 7, "pull_request": {}}}, "o", "r", None)
    assert out["number"] == 7
    assert out["title"] == "from file"


def test_resolve_fetches_issue_linked_pr(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TONIC_PULL_REQUEST_JSON", raising=False)
    api_pr = {"number": 9, "title": "api"}
    with patch("tonic_agent.__main__.get_pull_request", return_value=api_pr) as m:
        out = _resolve_pr_for_agent(
            {"issue": {"number": 9, "pull_request": {"url": "https://api.github.com/..."}}},
            "owner",
            "repo",
            "token",
        )
    m.assert_called_once_with("owner", "repo", 9, "token")
    assert out == api_pr


def test_resolve_string_issue_number(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TONIC_PULL_REQUEST_JSON", raising=False)
    api_pr = {"number": 3}
    with patch("tonic_agent.__main__.get_pull_request", return_value=api_pr) as m:
        out = _resolve_pr_for_agent(
            {"issue": {"number": "3", "pull_request": {}}},
            "o",
            "r",
            "t",
        )
    m.assert_called_once_with("o", "r", 3, "t")
    assert out["number"] == 3
