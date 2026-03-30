from tonic.hydration import LineTokenEstimateChunker


def test_line_token_estimate_chunker_splits_long_content():
    chunker = LineTokenEstimateChunker(max_lines_per_chunk=2, max_estimated_tokens=20)
    chunks = chunker.chunk_text("src/app.py", "one\ntwo\nthree\nfour")
    assert len(chunks) == 2
    assert chunks[0].start_line == 1
    assert chunks[0].end_line == 2
    assert chunks[1].start_line == 3
    assert chunks[1].end_line == 4


def test_line_token_estimate_chunker_extracts_symbol_hints():
    chunker = LineTokenEstimateChunker(max_lines_per_chunk=40, max_estimated_tokens=1000)
    chunks = chunker.chunk_text(
        "src/auth.py",
        "def resolve_auth(user: str) -> str:\n    return user\n",
    )
    assert len(chunks) == 1
    assert chunks[0].symbol == "resolve_auth"
