import os

import pytest

from tonic_agent.prompt_engineering import (
    PromptGenerator,
    PromptTemplate,
    determine_file_type,
    prompt_template_from_env,
)


def test_system_prompt_templates():
    g = PromptGenerator(PromptTemplate.Default)
    assert "Tonic" in g.generate_system_prompt()
    g2 = PromptGenerator(PromptTemplate.Enhanced)
    assert "semantic" in g2.generate_system_prompt().lower()
    g3 = PromptGenerator(PromptTemplate.ContextAware)
    assert "BASE" in g3.generate_system_prompt()


def test_custom_system_prompt_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("TONIC_AGENT_SYSTEM_PROMPT", "Custom prompt for testing")
    g = PromptGenerator(PromptTemplate.Default)
    assert g.generate_system_prompt() == "Custom prompt for testing"


def test_conflict_prompt_contains_left_right():
    from tonic_agent.models import ConflictFile, ConflictRegion

    cf = ConflictFile(path="t.py", conflicts=[], content="")
    c = ConflictRegion(
        base_content="",
        left_content="a",
        right_content="b",
        start_line=1,
        end_line=2,
        conflict_kind="added left",
    )
    g = PromptGenerator(PromptTemplate.Default)
    p = g.generate_conflict_prompt(cf, c)
    assert "LEFT" in p and "RIGHT" in p
    assert "added left" in p


def test_file_type_detection():
    assert determine_file_type("x.rs") == "Rust"
    assert determine_file_type("a.xyz") == "File with .xyz extension"


def test_prompt_template_from_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("TONIC_AGENT_PROMPT_TEMPLATE", "default")
    assert prompt_template_from_env() == PromptTemplate.Default
    monkeypatch.setenv("TONIC_AGENT_PROMPT_TEMPLATE", "context-aware")
    assert prompt_template_from_env() == PromptTemplate.ContextAware


def test_conflict_prompt_uses_custom_left_right_labels():
    from tonic_agent.models import ConflictFile, ConflictRegion

    cf = ConflictFile(
        path="t.py",
        conflicts=[],
        content="",
        left_label="alice",
        right_label="bob",
    )
    c = ConflictRegion(
        base_content="",
        left_content="a",
        right_content="b",
        start_line=1,
        end_line=2,
        conflict_kind="added left",
    )
    g = PromptGenerator(PromptTemplate.Default)
    p = g.generate_conflict_prompt(cf, c)
    assert "LEFT (alice):" in p
    assert "RIGHT (bob):" in p
