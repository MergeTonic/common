"""Code-search agent path (Python parity with TS runCodeSearchAgentTurns)."""

from __future__ import annotations

import json
from io import BytesIO
from unittest import mock

from tonic.hydration.code_search_agent import (
    code_search_agent_python_status,
    index_ast_chunks_for_code_search,
    run_code_search_agent_for_hydrate,
    run_code_search_agent_turns,
)
from tonic.hydration.memory_index import MemoryVectorIndex
from tonic.hydration.search_agent_tools import regex_search_hits, symbol_search_hits


def test_code_search_agent_python_status() -> None:
    assert code_search_agent_python_status() == "python_v1"


def test_regex_and_symbol_search_hits() -> None:
    pool = [
        {"chunk_id": "a", "text": "hello World", "score": 1.0, "metadata": {"ast_rule_id": "todo"}},
        {"chunk_id": "b", "text": "nope", "score": 0.5, "metadata": {"symbol": "foo"}},
    ]
    assert len(regex_search_hits(pool, "world")) == 1
    assert len(symbol_search_hits(pool, "todo")) == 1
    assert len(symbol_search_hits(pool, "foo")) == 1
    assert regex_search_hits(pool, "[bad") == []


def test_index_ast_chunks_minimal(tmp_path) -> None:
    (tmp_path / "a.ts").write_text("// one\n// two\n", encoding="utf-8")
    matches = [
        {
            "path": "a.ts",
            "rule_id": "r1",
            "start": {"line": 1},
            "end": {"line": 2},
        }
    ]
    idx = MemoryVectorIndex()
    from tonic.hydration.embedding_provider import HistogramEmbeddingProvider

    n = index_ast_chunks_for_code_search(str(tmp_path), matches, idx, HistogramEmbeddingProvider())
    assert n >= 1
    embs = HistogramEmbeddingProvider().embed_batch(["a.ts\n//"])
    res = idx.query(embs[0], 4)
    assert len(res["ids"]) >= 1


def test_run_code_search_agent_skipped_no_key(tmp_path) -> None:
    (tmp_path / "x.ts").write_text("export const x = 1;\n", encoding="utf-8")
    matches = [{"path": "x.ts", "rule_id": "r", "start": {"line": 1}, "end": {"line": 1}}]
    env = {
        "OPENAI_API_KEY": "",
        "TONIC_OPENAI_API_KEY": "",
        "TONIC_LLM_ALLOW_DUMMY_KEY": "",
    }
    steps = run_code_search_agent_for_hydrate(
        repo_root=str(tmp_path),
        matches=matches,
        env=env,
        intent_left="a",
        intent_right="b",
        llm_model="gpt-4o-mini",
        llm_base_url="https://api.openai.com/v1",
        openai_api_key_env="OPENAI_API_KEY",
    )
    assert len(steps) == 1
    assert steps[0]["tool"] == "code_search_agent"
    assert steps[0]["outcome"]["mode"] == "skipped_no_credentials"


def _fake_urlopen_response(content: str) -> object:
    class R:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return content.encode("utf-8")

    return R()


def test_run_code_search_agent_turns_mock_done(tmp_path) -> None:
    (tmp_path / "x.ts").write_text("const a = 1;\n", encoding="utf-8")
    matches = [{"path": "x.ts", "rule_id": "r", "start": {"line": 1}, "end": {"line": 1}}]
    completion = json.dumps(
        {
            "choices": [
                {"message": {"content": '{"tool":"done"}'}},
            ]
        }
    )
    with mock.patch(
        "tonic.hydration.code_search_agent.urllib.request.urlopen",
        return_value=_fake_urlopen_response(completion),
    ):
        steps = run_code_search_agent_turns(
            repo_root=str(tmp_path),
            matches=matches,
            env={},
            llm_model="m",
            llm_base_url="https://api.openai.com/v1",
            api_key="k",
            seed_query="find a",
            max_turns=2,
        )
    tools = [s["tool"] for s in steps]
    assert "semantic_query" in tools
    assert tools[-1] == "done"
