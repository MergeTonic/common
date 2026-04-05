from __future__ import annotations

import json

import pytest

from tonic import initial_state
from tonic.weave_git.manifest import parse_manifest_json, path_entry_for_file, serialize_manifest_json


def test_parse_roundtrip() -> None:
    _, entry = path_entry_for_file(
        rel_path="f.txt",
        text_canonical="one\ntwo",
        serialized_weave=initial_state(["one", "two"]),
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        degraded=False,
    )
    man = {
        "schema": "tonic-git-manifest",
        "version": "1",
        "commit": "abc",
        "paths": {"f.txt": entry},
    }
    raw = serialize_manifest_json(man)
    back = parse_manifest_json(raw)
    assert back["paths"]["f.txt"]["text_blob_sha"] == entry["text_blob_sha"]


def test_parse_rejects_bad_schema() -> None:
    with pytest.raises(ValueError, match="schema"):
        parse_manifest_json(json.dumps({"schema": "x", "version": "1", "commit": "a", "paths": {}}))
