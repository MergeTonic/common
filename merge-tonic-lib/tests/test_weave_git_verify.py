from __future__ import annotations

from pathlib import Path

from tonic import initial_state
from tonic.weave_git.manifest import path_entry_for_file, serialize_manifest_json
from tonic.weave_git.verify import verify_manifest, weave_blob_path


def test_verify_happy(tmp_path: Path) -> None:
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
    (wr / "manifest.json").write_text(serialize_manifest_json(man), encoding="utf-8")
    vr = verify_manifest(repo, man, weave_root=wr)
    assert vr.ok


def test_verify_strict_degraded(tmp_path: Path) -> None:
    wr = tmp_path / ".tonic" / "weave"
    (wr / "blobs").mkdir(parents=True)
    lines = ["a"]
    text = "a\n"
    (tmp_path / "x").write_text(text, encoding="utf-8")
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
    vr = verify_manifest(tmp_path, man, weave_root=wr, strict=True)
    assert not vr.ok
