from __future__ import annotations

import json
from pathlib import Path

from mergetonic_hf_weave.cli import main


def test_doctor_exits_zero() -> None:
    assert main(["doctor"]) == 0


def test_init_offline_zero(tmp_path: Path) -> None:
    assert main(["init", "--repo", str(tmp_path), "--offline"]) == 0


def test_push_offline_zero(tmp_path: Path) -> None:
    blobs = tmp_path / ".tonic" / "weave" / "blobs"
    blobs.mkdir(parents=True)
    (blobs / "deadbeef").write_bytes(b"x")
    assert main(["push", "--repo", str(tmp_path), "--offline"]) == 0


def test_pull_offline_with_manifest(tmp_path: Path) -> None:
    wr = tmp_path / ".tonic" / "weave"
    wr.mkdir(parents=True)
    man = {
        "schema": "tonic-git-manifest",
        "version": "1",
        "commit": "c",
        "paths": {
            "f.txt": {
                "text_blob_sha": "a" * 64,
                "weave_serialized_sha": "b" * 64,
                "weave_format_version": "1",
                "diff_engine_id": "tonic-v1",
            }
        },
    }
    (wr / "manifest.json").write_text(json.dumps(man), encoding="utf-8")
    assert main(["pull", "--repo", str(tmp_path), "--offline"]) == 0
