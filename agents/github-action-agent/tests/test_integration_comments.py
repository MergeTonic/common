"""Golden-style checks for PR comment payloads."""

from tonic_agent.github_comments import (
    Verbosity,
    build_inline_thread_comment,
    build_summary_body,
    marker_summary,
)


def test_summary_idempotency_marker():
    body = build_summary_body("run-42", "feat: x", [{"path": "a.py"}], verbosity=Verbosity.MEDIUM)
    assert marker_summary("run-42") in body


def test_inline_hidden_key_stable():
    b = build_inline_thread_comment("src/x.ts", 10, 12, "added left", "code")
    assert "tonic-agent:inline:src/x.ts:10:12:added left" in b
