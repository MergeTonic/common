from __future__ import annotations

from tonic.remote_spec import resolve_github_remote_spec, resolve_hub_repo_spec, resolve_remote_spec


def test_hub_bare_id() -> None:
    r = resolve_hub_repo_spec("org/model")
    assert r is not None
    assert r.repo_id == "org/model"


def test_github_https() -> None:
    r = resolve_github_remote_spec("https://github.com/foo/bar")
    assert r is not None
    assert "github.com" in r.url


def test_resolve_remote_spec_order() -> None:
    r = resolve_remote_spec("https://huggingface.co/acme/cool-model")
    assert r is not None
    assert r.kind == "hub"
