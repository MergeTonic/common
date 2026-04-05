"""Py vs TS ``verify_report_json`` / ``verifyReportJson`` for the same fixture (requires built @mergetonic/core)."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

from tonic import initial_state
from tonic.weave_git.manifest import path_entry_for_file, serialize_manifest_json
from tonic.weave_git.verify import verify_report_json, weave_blob_path

REPO_ROOT = Path(__file__).resolve().parents[2]
CORE_DIST = REPO_ROOT / "packages" / "tonic-core" / "dist" / "index.js"


def _strip_repo_root(report: dict[str, object]) -> dict[str, object]:
    out = dict(report)
    out["repo_root"] = "<repo>"
    return out


@pytest.mark.skipif(not CORE_DIST.is_file(), reason="@mergetonic/core dist not built")
def test_verify_report_json_matches_ts_happy_path(tmp_path: Path) -> None:
    repo = tmp_path
    wr = repo / ".tonic" / "weave"
    (wr / "blobs").mkdir(parents=True)
    lines = ["hello", "world"]
    text = "\n".join(lines) + "\n"
    (repo / "doc.txt").write_text(text, encoding="utf-8")
    st = initial_state(lines)
    _, entry = path_entry_for_file(
        rel_path="doc.txt",
        text_canonical=text,
        serialized_weave=st,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
    )
    blob = weave_blob_path(wr, entry["weave_serialized_sha"])
    blob.write_bytes(st.encode("utf-8"))
    man = {
        "schema": "tonic-git-manifest",
        "version": "1",
        "commit": "c0ffee",
        "paths": {"doc.txt": entry},
    }
    raw = serialize_manifest_json(man)
    py_report = json.loads(
        verify_report_json(repo, raw, weave_root=wr),
    )
    dist_js = str(CORE_DIST.resolve()).replace("\\", "\\\\")
    repo_s = str(repo.resolve())
    wr_s = str(wr.resolve())
    script = f"""
const c = require("{dist_js}");
const raw = {json.dumps(raw)};
const out = c.verifyReportJson({json.dumps(repo_s)}, raw, {{ weaveRoot: {json.dumps(wr_s)} }});
process.stdout.write(out);
"""
    env = {**os.environ}
    np = str((REPO_ROOT / "packages" / "tonic-core").resolve())
    env["NODE_PATH"] = np + (os.pathsep + env["NODE_PATH"] if env.get("NODE_PATH") else "")
    p = subprocess.run(
        ["node", "-e", script],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert p.returncode == 0, p.stderr + p.stdout
    ts_report = json.loads(p.stdout)
    assert _strip_repo_root(py_report) == _strip_repo_root(ts_report)


@pytest.mark.skipif(not CORE_DIST.is_file(), reason="@mergetonic/core dist not built")
def test_verify_report_json_matches_ts_strict_degraded(tmp_path: Path) -> None:
    repo = tmp_path
    wr = repo / ".tonic" / "weave"
    (wr / "blobs").mkdir(parents=True)
    lines = ["a"]
    text = "a\n"
    (repo / "x").write_text(text, encoding="utf-8")
    st = initial_state(lines)
    _, entry = path_entry_for_file(
        rel_path="x",
        text_canonical=text,
        serialized_weave=st,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        degraded=True,
    )
    blob = weave_blob_path(wr, entry["weave_serialized_sha"])
    blob.write_bytes(st.encode("utf-8"))
    man = {
        "schema": "tonic-git-manifest",
        "version": "1",
        "commit": "c0ffee",
        "paths": {"x": entry},
    }
    raw = serialize_manifest_json(man)
    py_report = json.loads(
        verify_report_json(repo, raw, weave_root=wr, strict=True),
    )
    dist_js = str(CORE_DIST.resolve()).replace("\\", "\\\\")
    repo_s = str(repo.resolve())
    wr_s = str(wr.resolve())
    script = f"""
const c = require("{dist_js}");
const raw = {json.dumps(raw)};
const out = c.verifyReportJson({json.dumps(repo_s)}, raw, {{ weaveRoot: {json.dumps(wr_s)}, strict: true }});
process.stdout.write(out);
"""
    env = {**os.environ}
    np = str((REPO_ROOT / "packages" / "tonic-core").resolve())
    env["NODE_PATH"] = np + (os.pathsep + env["NODE_PATH"] if env.get("NODE_PATH") else "")
    p = subprocess.run(
        ["node", "-e", script],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert p.returncode == 0, p.stderr + p.stdout
    ts_report = json.loads(p.stdout)
    assert _strip_repo_root(py_report) == _strip_repo_root(ts_report)
    assert py_report["status"] == "failed"
