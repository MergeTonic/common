import pytest

from tonic_agent.labels import apply_pr_labels_to_conflict_file
from tonic_agent.models import ConflictFile


def test_apply_pr_labels_prefers_alias_over_login(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("INPUT_AUTHOR_ALIAS_LEFT", "aliasL")
    monkeypatch.setenv("INPUT_GITHUB_LOGIN_LEFT", "loginL")
    monkeypatch.setenv("INPUT_AUTHOR_ALIAS_RIGHT", "aliasR")
    monkeypatch.setenv("INPUT_GITHUB_LOGIN_RIGHT", "loginR")
    cf = ConflictFile(path="x", conflicts=[], content="")
    out = apply_pr_labels_to_conflict_file(cf)
    assert out.left_label == "aliasL"
    assert out.right_label == "aliasR"


def test_apply_pr_labels_falls_back_to_login(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("INPUT_AUTHOR_ALIAS_LEFT", raising=False)
    monkeypatch.delenv("INPUT_AUTHOR_ALIAS_RIGHT", raising=False)
    monkeypatch.setenv("INPUT_GITHUB_LOGIN_LEFT", "u1")
    monkeypatch.setenv("INPUT_GITHUB_LOGIN_RIGHT", "u2")
    cf = ConflictFile(path="x", conflicts=[], content="", left_label="left", right_label="right")
    out = apply_pr_labels_to_conflict_file(cf)
    assert out.left_label == "u1"
    assert out.right_label == "u2"


def test_apply_pr_labels_keeps_defaults_when_empty(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("INPUT_AUTHOR_ALIAS_LEFT", raising=False)
    monkeypatch.delenv("INPUT_AUTHOR_ALIAS_RIGHT", raising=False)
    monkeypatch.delenv("INPUT_GITHUB_LOGIN_LEFT", raising=False)
    monkeypatch.delenv("INPUT_GITHUB_LOGIN_RIGHT", raising=False)
    cf = ConflictFile(path="x", conflicts=[], content="", left_label="L", right_label="R")
    out = apply_pr_labels_to_conflict_file(cf)
    assert out.left_label == "L"
    assert out.right_label == "R"
