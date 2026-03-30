"""Hydration: contents decode, download_url fallback, git blob fallback."""

from unittest.mock import patch

from tonic_agent import hydrate
from tonic_agent.hydrate import decode_file_content, fetch_file_text
from tonic_agent.hydrate_git_merge import hydrate_git_merge


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


def test_hydrate_git_merge_reads_unmerged(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(workspace: str, args: list[str], *, allow_fail: bool = False) -> str:
        calls.append(args)
        if args[:3] == ["diff", "--name-only", "--diff-filter"]:
            return "a.txt\n"
        if args[0] == "show" and args[1].startswith(":2:"):
            return "left\n"
        if args[0] == "show" and args[1].startswith(":3:"):
            return "right\n"
        return ""

    class DummyPath:
        def __init__(self, _p: str):
            pass

        def resolve(self):
            return self

        def __truediv__(self, _other: str):
            return self

        def exists(self):
            return True

        def read_text(self, encoding="utf-8", errors=None):
            return "<<<<<<< ours\nleft\n=======\nright\n>>>>>>> theirs\n"

    monkeypatch.setattr("tonic_agent.hydrate_git_merge._run_git", fake_run)
    monkeypatch.setattr("tonic_agent.hydrate_git_merge.Path", lambda *_: DummyPath("x"))
    with patch.dict("os.environ", {"GITHUB_ACTIONS": "false"}, clear=False):
        out = hydrate_git_merge(workspace="w", base_sha="b", head_sha="h", max_files=10)
    assert "a.txt" in out
    assert out["a.txt"]["status"] == "unmerged"
    assert out["a.txt"]["annotated_lines"][0].startswith("<<<<<<< begin git merge")
    assert "author=base" in out["a.txt"]["annotated_lines"][0]
    assert "intent=preserve_base" in out["a.txt"]["annotated_lines"][0]
    assert any(a[:2] == ["checkout", "-f"] for a in calls)


def test_hydrate_git_merge_fails_non_conflict_merge_error(monkeypatch):
    def fake_run(workspace: str, args: list[str], *, allow_fail: bool = False) -> str:
        if args[:2] == ["merge", "--no-ff"]:
            return "fatal: merge failed"
        if args[:3] == ["diff", "--name-only", "--diff-filter"]:
            return ""
        return ""

    monkeypatch.setattr("tonic_agent.hydrate_git_merge._run_git", fake_run)
    with patch.dict("os.environ", {"GITHUB_ACTIONS": "false"}, clear=False):
        try:
            hydrate_git_merge(workspace="w", base_sha="b", head_sha="h", max_files=10)
            raise AssertionError("expected RuntimeError")
        except RuntimeError as exc:
            assert "failed without unmerged files" in str(exc)


def test_hydrate_git_merge_allows_clean_merge(monkeypatch):
    def fake_run(workspace: str, args: list[str], *, allow_fail: bool = False) -> str:
        if args[:2] == ["merge", "--no-ff"]:
            return "Already up to date."
        if args[:3] == ["diff", "--name-only", "--diff-filter"]:
            return ""
        return ""

    monkeypatch.setattr("tonic_agent.hydrate_git_merge._run_git", fake_run)
    with patch.dict("os.environ", {"GITHUB_ACTIONS": "false"}, clear=False):
        out = hydrate_git_merge(workspace="w", base_sha="b", head_sha="h", max_files=10)
    assert out == {}


def test_hydrate_git_merge_restores_original_branch(monkeypatch):
    calls: list[list[str]] = []

    def fake_run(workspace: str, args: list[str], *, allow_fail: bool = False) -> str:
        calls.append(args)
        if args[:4] == ["symbolic-ref", "--quiet", "--short", "HEAD"]:
            return "tonic/agent/123\n"
        if args[:2] == ["merge", "--no-ff"]:
            return "Already up to date."
        if args[:3] == ["diff", "--name-only", "--diff-filter"]:
            return ""
        return ""

    monkeypatch.setattr("tonic_agent.hydrate_git_merge._run_git", fake_run)
    with patch.dict("os.environ", {"GITHUB_ACTIONS": "false"}, clear=False):
        out = hydrate_git_merge(workspace="w", base_sha="b", head_sha="h", max_files=10)
    assert out == {}
    assert ["checkout", "-f", "tonic/agent/123"] in calls
