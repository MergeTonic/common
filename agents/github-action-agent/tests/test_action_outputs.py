from __future__ import annotations

from pathlib import Path

from tonic_agent.__main__ import _write_action_outputs


def test_write_action_outputs_writes_expected_keys(tmp_path: Path, monkeypatch) -> None:
    out = tmp_path / "github_output.txt"
    monkeypatch.setenv("GITHUB_OUTPUT", str(out))
    _write_action_outputs(
        status="ok",
        files_analyzed=12,
        conflicted_files=4,
        report_path="merge-tonic-report.json",
    )
    body = out.read_text(encoding="utf-8")
    assert "status=ok" in body
    assert "files_analyzed=12" in body
    assert "conflicted_files=4" in body
    assert "report_path=merge-tonic-report.json" in body
