"""Parser used by tonic-pr-agent-comment workflow."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[3]


def _parse_mod():
    path = _REPO_ROOT / "scripts" / "ci" / "parse_tonicmerge_comment.py"
    spec = importlib.util.spec_from_file_location("_tonicmerge_parse", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_parse_tonicmerge_hydrate_token() -> None:
    mod = _parse_mod()
    d = mod.parse_tonicmerge_body("cc @tonicmerge hydrate thanks")
    assert d["enable_ast_hydration"] == "true"
    assert d["ast_hydration_subcommand"] == "hydrate"


def test_parse_tonicmerge_intent_and_query() -> None:
    mod = _parse_mod()
    d = mod.parse_tonicmerge_body('@tonicmerge intent=keep,drop q="hello world"')
    assert d.get("intent_pair") == "keep,drop"
    assert d.get("hydration_user_query") == "hello world"


def test_parse_question_mode() -> None:
    mod = _parse_mod()
    d = mod.parse_tonicmerge_body("@tonicmerge hydrate question_mode=auto")
    assert d.get("hydration_question_mode") == "auto"


def test_parse_no_token_returns_defaults() -> None:
    mod = _parse_mod()
    d = mod.parse_tonicmerge_body("no mention here")
    assert d["enable_ast_hydration"] == "false"
    assert d["ast_hydration_subcommand"] == "ast-grep-hydrate"
    assert d.get("ast_hydration_extra_args") == ""
    assert d.get("ast_hydration_extra_args_chroma") == "--enable-retrieval --retrieval-backend chroma"


def test_parse_retrieval_token() -> None:
    mod = _parse_mod()
    d = mod.parse_tonicmerge_body("@tonicmerge hydrate retrieval")
    assert d["ast_hydration_extra_args"] == "--enable-retrieval"
    assert d["ast_hydration_extra_args_chroma"] == "--enable-retrieval --retrieval-backend chroma"


def test_parse_retrieval_backend_token() -> None:
    mod = _parse_mod()
    d = mod.parse_tonicmerge_body("@tonicmerge hydrate retrieval_backend=memory")
    assert "--enable-retrieval" in d["ast_hydration_extra_args"]
    assert "--retrieval-backend memory" in d["ast_hydration_extra_args"]
    assert d["ast_hydration_extra_args_chroma"] == "--enable-retrieval --retrieval-backend chroma"


def test_merge_chroma_service_extra_args() -> None:
    mod = _parse_mod()
    assert mod.merge_chroma_service_extra_args("") == "--enable-retrieval --retrieval-backend chroma"
    assert mod.merge_chroma_service_extra_args("--enable-retrieval") == "--enable-retrieval --retrieval-backend chroma"
    assert (
        mod.merge_chroma_service_extra_args("--enable-retrieval --retrieval-backend memory")
        == "--enable-retrieval --retrieval-backend chroma"
    )


def test_write_github_output_multiline(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    mod = _parse_mod()
    out = tmp_path / "gho.txt"
    monkeypatch.setenv("GITHUB_OUTPUT", str(out))
    mod._write_github_output({"a": "1", "b": "x\ny"})
    text = out.read_text(encoding="utf-8")
    assert "a=1" in text
    assert "b<<TONICMERGE_EOF" in text
    assert "x\ny" in text
