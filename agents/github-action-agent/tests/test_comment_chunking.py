from tonic_agent.comment_chunking import markdown_text_fences, split_text_utf8_chunks


def test_split_text_utf8_chunks_splits_large_input():
    text = "\n".join([f"line-{i}" for i in range(5000)])
    parts = split_text_utf8_chunks(text, max_bytes=2000)
    assert len(parts) > 1
    assert "".join(parts) == text or "\n".join(parts) == text


def test_markdown_text_fences_single_part():
    body = markdown_text_fences("Title", "a\nb")
    assert "```text" in body
    assert "a\nb" in body
