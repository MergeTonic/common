"""Chunker parity with TS @mergetonic/coding-hydration."""

from __future__ import annotations

from pathlib import Path

from tonic.hydration.ast_grep_chunker import chunk_file_ast_grep, chunks_from_ast_artifact


def test_chunk_file_ast_grep_extracts_lines(tmp_path: Path) -> None:
    f = tmp_path / "sample.ts"
    f.write_text("line1\nline2\nline3\n", encoding="utf-8")
    matches = [
        {"path": "sample.ts", "rule_id": "r1", "start": {"line": 1, "column": 0}, "end": {"line": 2, "column": 0}},
    ]
    chunks = chunk_file_ast_grep(str(tmp_path), "sample.ts", matches)
    assert len(chunks) == 1
    assert "line1" in chunks[0]["text"]


def test_chunks_from_ast_artifact_sorted_paths(tmp_path: Path) -> None:
    (tmp_path / "b.ts").write_text("a\n", encoding="utf-8")
    (tmp_path / "a.ts").write_text("z\n", encoding="utf-8")
    matches = [
        {"path": "b.ts", "rule_id": "x", "start": {"line": 1}},
        {"path": "a.ts", "rule_id": "y", "start": {"line": 1}},
    ]
    chunks = chunks_from_ast_artifact(str(tmp_path), matches)
    assert [c["path"] for c in chunks] == ["a.ts", "b.ts"]


def test_chunks_from_single_line_match(tmp_path: Path) -> None:
    (tmp_path / "sample.ts").write_text("// x\n", encoding="utf-8")
    m = [{"path": "sample.ts", "rule_id": "test-rule", "start": {"line": 1}, "end": {"line": 1}}]
    ch = chunks_from_ast_artifact(str(tmp_path), m)
    assert len(ch) >= 1
