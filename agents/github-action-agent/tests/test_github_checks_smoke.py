"""Smoke import for github_checks (full run needs GitHub token)."""

from tonic_agent import github_checks


def test_github_checks_module_importable():
    assert callable(github_checks.post_tonic_check)
