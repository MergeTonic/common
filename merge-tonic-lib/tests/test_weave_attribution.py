from __future__ import annotations

from tonic import initial_state, update_state
from tonic.weave_git.attribution import (
    attribution_lines_from_weave_serialized,
    build_sidecar_from_weave_serialized,
)


def test_attribution_visible_lines_match_current_text() -> None:
    s = initial_state(["a", "b"], commit_id="c0")
    lines = attribution_lines_from_weave_serialized(s)
    assert [x["line"] for x in lines] == ["a", "b"]
    assert all("provenance" in x for x in lines)


def test_sidecar_sha_matches_manifest_hash() -> None:
    s = update_state(initial_state(["x"], commit_id="c0"), ["x", "y"], commit_id="c1")
    sc = build_sidecar_from_weave_serialized(s)
    assert sc["schema"] == "tonic-weave-attribution-v1"
    from tonic.weave_git.replay import state_hash

    assert sc["weave_serialized_sha"] == state_hash(s)
    assert len(sc["lines"]) == 2
