from __future__ import annotations

import pytest

from tonic_agent import __main__ as main_mod


def test_load_immutable_targets_allows_event_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TONIC_TARGET_BASE_SHA", raising=False)
    monkeypatch.delenv("TONIC_TARGET_HEAD_SHA", raising=False)
    monkeypatch.delenv("TONIC_TARGET_BASE_BRANCH", raising=False)
    out = main_mod._load_immutable_targets(
        {"number": 7, "base": {"sha": "abc", "ref": "main"}, "head": {"sha": "def"}},
        allow_event_fallback=True,
    )
    assert out.source_pr_number == 7
    assert out.base_sha == "abc"
    assert out.head_sha == "def"
    assert out.base_branch == "main"


def test_assert_target_context_rejects_identical_pr() -> None:
    with pytest.raises(RuntimeError, match="source and target PR are identical"):
        main_mod._assert_target_context(
            main_mod.PublishContext(
                source_pr_number=12,
                target_pr_number=12,
                target_head_sha="abc",
                target_base_branch="main",
                source_head_sha="abc",
            )
        )


def test_load_immutable_targets_requires_contract_without_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("TONIC_TARGET_BASE_SHA", raising=False)
    monkeypatch.delenv("TONIC_TARGET_HEAD_SHA", raising=False)
    monkeypatch.delenv("TONIC_TARGET_BASE_BRANCH", raising=False)
    with pytest.raises(RuntimeError, match="missing immutable target contract keys"):
        main_mod._load_immutable_targets(
            {"number": 7, "base": {"sha": "abc", "ref": "main"}, "head": {"sha": "def"}},
            allow_event_fallback=False,
        )
