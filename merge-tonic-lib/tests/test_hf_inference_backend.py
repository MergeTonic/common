"""Offline tests for hf_inference backend selection (mocked InferenceClient)."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

from tonic.hydration.embedding_provider import HfInferenceEmbeddingProvider
from tonic.hydration.llm_refinement import LlmChatParams, call_hf_inference_json, call_llm_json


def test_hf_inference_embed_batch_mock() -> None:
    with patch("huggingface_hub.InferenceClient") as ic:
        ic.return_value.feature_extraction.return_value = [0.1, 0.2]
        p = HfInferenceEmbeddingProvider(model="m")
        with patch.dict(os.environ, {"HF_TOKEN": "t"}, clear=False):
            v = p.embed_batch(["x"])
        assert len(v) == 1 and len(v[0]) == 2


def test_call_llm_json_routes_hf(monkeypatch) -> None:
    monkeypatch.setenv("TONIC_LLM_BACKEND", "hf_inference")
    monkeypatch.setenv("HF_TOKEN", "tok")
    monkeypatch.setenv("TONIC_HF_CHAT_MODEL", "m")
    fake_resp = MagicMock()
    fake_resp.choices = [MagicMock(message=MagicMock(content='{"ok":true}'))]
    with patch("huggingface_hub.InferenceClient") as ic:
        ic.return_value.chat_completion.return_value = fake_resp
        ok, text = call_llm_json(
            LlmChatParams(
                base_url="http://x",
                model="m",
                api_key="",
                system="s",
                user="u",
                timeout_ms=1000,
                json_object=False,
            )
        )
        assert ok and '"ok"' in text


def test_call_hf_inference_json_empty_token(monkeypatch) -> None:
    monkeypatch.delenv("HF_TOKEN", raising=False)
    monkeypatch.delenv("TONIC_LLM_BACKEND", raising=False)
    ok, msg = call_hf_inference_json(
        LlmChatParams(
            base_url="",
            model="m",
            api_key="",
            system="s",
            user="u",
            timeout_ms=1000,
        )
    )
    assert not ok and "HF_TOKEN" in msg
