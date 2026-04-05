from __future__ import annotations

from pathlib import Path

from tonic.repo_profile import (
    default_repo_profile,
    merge_repo_profiles,
    parse_repo_profile_json,
    read_repo_profile,
    refs_to_fetch_from_profile,
    write_repo_profile,
)


def test_parse_and_roundtrip(tmp_path: Path) -> None:
    p = default_repo_profile()
    p["left_ref"] = "main"
    write_repo_profile(tmp_path, p)
    got = read_repo_profile(tmp_path)
    assert got is not None
    assert got["left_ref"] == "main"


def test_merge_idempotent_remote() -> None:
    base = default_repo_profile()
    base["left_ref"] = "a"
    m = merge_repo_profiles(base, {"right_ref": "b", "remote": ""})
    assert m["right_ref"] == "b"
    assert m["remote"] == "origin"


def test_refs_to_fetch() -> None:
    p = default_repo_profile()
    p["canonical_ref"] = "main"
    p["left_ref"] = "main"
    p["right_ref"] = "f"
    assert "main" in refs_to_fetch_from_profile(p)
    assert "f" in refs_to_fetch_from_profile(p)


def test_parse_json() -> None:
    raw = '{"schema":"tonic-repo-profile","version":"1","remote":"origin"}'
    o = parse_repo_profile_json(raw)
    assert o["remote"] == "origin"
