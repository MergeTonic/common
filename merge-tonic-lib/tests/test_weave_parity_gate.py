"""Py/TS parity for `pathEntryForFile` / manifest entry hashes (requires built @mergetonic/core)."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

from tonic import initial_state
from tonic.weave_git.manifest import path_entry_for_file, serialize_manifest_json

REPO_ROOT = Path(__file__).resolve().parents[2]
CORE_DIST = REPO_ROOT / "packages" / "tonic-core" / "dist" / "index.js"


@pytest.mark.skipif(not CORE_DIST.is_file(), reason="@mergetonic/core dist not built")
def test_path_entry_matches_ts() -> None:
    lines = ["line-a", "line-b"]
    text = "\n".join(lines) + "\n"
    st = initial_state(lines)
    _, py_e = path_entry_for_file(
        rel_path="p.txt",
        text_canonical=text,
        serialized_weave=st,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
    )
    dist_js = str(CORE_DIST.resolve()).replace("\\", "\\\\")
    script = f"""
const c = require("{dist_js}");
const st = c.initialState({json.dumps(lines)});
const [_k, e] = c.pathEntryForFile({{
  relPath: "p.txt",
  textCanonical: {json.dumps(text)},
  serializedWeave: st,
  weaveFormatVersion: "1",
  diffEngineId: "tonic-v1",
}});
console.log(JSON.stringify(e));
"""
    env = {**os.environ}
    np = str((REPO_ROOT / "packages" / "tonic-core").resolve())
    if env.get("NODE_PATH"):
        env["NODE_PATH"] = np + os.pathsep + env["NODE_PATH"]
    else:
        env["NODE_PATH"] = np
    p = subprocess.run(
        ["node", "-e", script],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    assert p.returncode == 0, p.stderr + p.stdout
    ts_e = json.loads(p.stdout.strip())
    assert ts_e["text_blob_sha"] == py_e["text_blob_sha"]
    assert ts_e["weave_serialized_sha"] == py_e["weave_serialized_sha"]


@pytest.mark.skipif(not CORE_DIST.is_file(), reason="@mergetonic/core dist not built")
def test_serialize_manifest_json_matches_ts() -> None:
    man = {
        "schema": "tonic-git-manifest",
        "version": "1",
        "commit": "0000000000000000000000000000000000000000",
        "paths": {
            "z.txt": {
                "diff_engine_id": "tonic-v1",
                "text_blob_sha": "a" * 64,
                "weave_format_version": "1",
                "weave_serialized_sha": "b" * 64,
                "parent_weave_shas": ["c" * 64],
            },
        },
    }
    py_out = serialize_manifest_json(man)
    dist_js = str(CORE_DIST.resolve()).replace("\\", "\\\\")
    script = f"""
const c = require("{dist_js}");
const man = {json.dumps(man)};
process.stdout.write(c.serializeManifestJson(man));
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
    assert p.stdout == py_out
