from __future__ import annotations

from tonic import initial_state, update_state
from tonic.weave_git.manifest import path_entry_for_file
from tonic.weave_git.merge_driver import merge_driver_compatibility_errors, run_option_a_merge
from tonic.weave_git.replay import state_hash


def test_option_a_full_merge() -> None:
    base = ["a"]
    sb = initial_state(base)
    so = sb
    st = update_state(sb, ["a", "c"], commit_id="c2")
    r = run_option_a_merge(
        text_base="a\n",
        text_ours="a\n",
        text_theirs="a\nc\n",
        load_state_ours=lambda: so,
        load_state_theirs=lambda: st,
        load_state_base=lambda: sb,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        strict=True,
    )
    assert r.exit_code == 0
    assert r.manifest_entry is not None
    assert r.manifest_entry.get("degraded") is not True


def test_option_a_strict_missing_base_fails() -> None:
    so = initial_state(["x"])
    st = initial_state(["y"])
    r = run_option_a_merge(
        text_base="",
        text_ours="x\n",
        text_theirs="y\n",
        load_state_ours=lambda: so,
        load_state_theirs=lambda: st,
        load_state_base=lambda: None,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        strict=True,
    )
    assert r.exit_code == 1


def test_option_a_non_strict_degraded() -> None:
    so = initial_state(["a"])
    st = initial_state(["b"])
    r = run_option_a_merge(
        text_base="",
        text_ours="a\n",
        text_theirs="b\n",
        load_state_ours=lambda: so,
        load_state_theirs=lambda: st,
        load_state_base=lambda: None,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        strict=False,
    )
    assert r.exit_code == 1  # conflict markers in snapshot merge
    assert r.manifest_entry is not None
    assert r.manifest_entry.get("degraded") is True


def test_strict_text_weave_mismatch_fails() -> None:
    so = initial_state(["a"])
    st = initial_state(["b"])
    sb = initial_state(["x"])
    r = run_option_a_merge(
        text_base="x\n",
        text_ours="z\n",
        text_theirs="b\n",
        load_state_ours=lambda: so,
        load_state_theirs=lambda: st,
        load_state_base=lambda: sb,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        strict=True,
    )
    assert r.exit_code == 1
    assert any("ours:" in m and "Git text" in m for m in r.stderr)


def test_parent_weave_shas_must_include_base() -> None:
    base = ["line"]
    sb = initial_state(base)
    so = update_state(sb, ["line", "o"], commit_id="c1")
    st = update_state(sb, ["line", "t"], commit_id="c2")
    bsha = state_hash(sb)
    _, e_ours = path_entry_for_file(
        rel_path="f",
        text_canonical="line\no\n",
        serialized_weave=so,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        parent_weave_shas=["wrongnotbase"],
    )
    _, e_theirs = path_entry_for_file(
        rel_path="f",
        text_canonical="line\nt\n",
        serialized_weave=st,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        parent_weave_shas=[bsha],
    )
    r = run_option_a_merge(
        text_base="line\n",
        text_ours="line\no\n",
        text_theirs="line\nt\n",
        load_state_ours=lambda: so,
        load_state_theirs=lambda: st,
        load_state_base=lambda: sb,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        strict=True,
        manifest_entry_base={"weave_serialized_sha": bsha, "weave_format_version": "1", "diff_engine_id": "tonic-v1"},
        manifest_entry_ours=dict(e_ours),
        manifest_entry_theirs=dict(e_theirs),
    )
    assert r.exit_code == 1
    assert any("parent_weave_shas" in m for m in r.stderr)


def test_merge_driver_compatibility_errors_empty_when_parent_ok() -> None:
    base = ["line"]
    sb = initial_state(base)
    so = update_state(sb, ["line", "o"], commit_id="c1")
    st = update_state(sb, ["line", "t"], commit_id="c2")
    bsha = state_hash(sb)
    _, e_base = path_entry_for_file(
        rel_path="f",
        text_canonical="line\n",
        serialized_weave=sb,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
    )
    _, e_ours = path_entry_for_file(
        rel_path="f",
        text_canonical="line\no\n",
        serialized_weave=so,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        parent_weave_shas=[bsha],
    )
    _, e_theirs = path_entry_for_file(
        rel_path="f",
        text_canonical="line\nt\n",
        serialized_weave=st,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        parent_weave_shas=[bsha],
    )
    err = merge_driver_compatibility_errors(
        text_base="line\n",
        text_ours="line\no\n",
        text_theirs="line\nt\n",
        s_base=sb,
        s_ours=so,
        s_theirs=st,
        weave_format_version="1",
        diff_engine_id="tonic-v1",
        manifest_entry_base=dict(e_base),
        manifest_entry_ours=dict(e_ours),
        manifest_entry_theirs=dict(e_theirs),
    )
    assert err == []
