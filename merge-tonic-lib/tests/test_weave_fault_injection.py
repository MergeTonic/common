from __future__ import annotations

from pathlib import Path

import pytest

from tonic import initial_state
from tonic.weave_git.manifest import path_entry_for_file, serialize_manifest_json
from tonic.weave_git.replay import deserialize_with_cap
from tonic.weave_git.verify import verify_manifest, weave_blob_path


def test_missing_weave_blob_fails_verify(tmp_path: Path) -> None:
    (tmp_path / "a").write_text("z\n", encoding="utf-8")
    st = initial_state(["z"])
    _, entry = path_entry_for_file(
        rel_path="a",
        text_canonical="z\n",
        serialized_weave=st,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
    )
    wr = tmp_path / ".tonic" / "weave"
    man = {"schema": "tonic-git-manifest", "version": "1", "commit": "x", "paths": {"a": entry}}
    vr = verify_manifest(tmp_path, man, weave_root=wr)
    assert not vr.ok


def test_wrong_blob_sha_fails_verify(tmp_path: Path) -> None:
    (tmp_path / "a").write_text("z\n", encoding="utf-8")
    st = initial_state(["z"])
    _, entry = path_entry_for_file(
        rel_path="a",
        text_canonical="z\n",
        serialized_weave=st,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
    )
    wr = tmp_path / ".tonic" / "weave"
    (wr / "blobs").mkdir(parents=True)
    bad = weave_blob_path(wr, entry["weave_serialized_sha"])
    bad.write_bytes(b"not-the-state")
    man = {"schema": "tonic-git-manifest", "version": "1", "commit": "x", "paths": {"a": entry}}
    vr = verify_manifest(tmp_path, man, weave_root=wr)
    assert not vr.ok


def test_deserialize_size_cap() -> None:
    huge = "0 " * 10_000
    with pytest.raises(ValueError, match="max_bytes"):
        deserialize_with_cap(huge, max_bytes=4)
