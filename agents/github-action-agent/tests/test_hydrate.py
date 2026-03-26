"""Hydration: contents decode, download_url fallback, git blob fallback."""

from unittest.mock import patch

from tonic_agent import hydrate
from tonic_agent.hydrate import decode_file_content, fetch_file_text


def test_decode_file_content_base64():
    import base64

    payload = {
        "encoding": "base64",
        "content": base64.b64encode(b"hello\nworld").decode("ascii"),
    }
    assert decode_file_content(payload) == "hello\nworld"


def test_fetch_file_text_download_url_fallback():
    payload = {
        "type": "file",
        "download_url": "https://example.com/raw",
    }
    with (
        patch.object(hydrate, "get_contents_payload", return_value=payload),
        patch.object(hydrate, "decode_file_content", return_value=None),
        patch.object(
            hydrate, "fetch_url_text_authenticated", return_value="from-url"
        ) as m_url,
    ):
        out = fetch_file_text("o", "r", "p.txt", "ref", "tok")
    assert out == "from-url"
    m_url.assert_called_once()


def test_fetch_file_text_blob_fallback():
    payload = {"type": "file", "encoding": "none", "content": None}
    with (
        patch.object(hydrate, "get_contents_payload", return_value=payload),
        patch.object(hydrate, "decode_file_content", return_value=None),
        patch.object(hydrate, "fetch_url_text_authenticated", return_value=None),
        patch.object(
            hydrate, "get_git_blob_text", return_value="blobtext"
        ) as m_blob,
    ):
        out = fetch_file_text(
            "o", "r", "p.txt", "ref", "tok", blob_sha="abc123"
        )
    assert out == "blobtext"
    m_blob.assert_called_once_with("o", "r", "abc123", "tok")


def test_get_git_blob_text_decodes():
    import base64

    from tonic_agent import github_api

    raw = b"file-bytes"
    b64 = base64.b64encode(raw).decode("ascii")
    with patch.object(github_api, "get_json", return_value={"encoding": "base64", "content": b64}):
        assert github_api.get_git_blob_text("o", "r", "sha", "t") == "file-bytes"
