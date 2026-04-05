"""Sanity check comment-driven workflow wiring."""

from __future__ import annotations

from pathlib import Path


def test_tonic_pr_agent_comment_workflow_yaml() -> None:
    root = Path(__file__).resolve().parents[3]
    wf = root / ".github" / "workflows" / "tonic-pr-agent-comment.yml"
    text = wf.read_text(encoding="utf-8")
    assert "issue_comment" in text
    assert "uses: ./agents/github-action-agent" in text
    assert "merge_engine: api" in text
    assert "parse_tonicmerge_comment.py" in text
    assert "@tonicmerge" in text
    assert "ast_hydration_extra_args:" in text
    assert "tonic_ast_chroma" in text
    assert "TONIC_PR_AGENT_CHROMA_SERVICE" in text
