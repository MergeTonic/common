from tonic_agent.models import (
    MERGE_ARTIFACT_VERSION,
    ConflictRegion,
    MergeArtifact,
    merge_report_dict,
)


def test_merge_artifact_to_dict():
    art = MergeArtifact(
        path="x.py",
        base_sha="a" * 40,
        head_sha="b" * 40,
        left_line_count=2,
        right_line_count=3,
        merged_line_count=4,
        markers_present=True,
        conflict_regions=[ConflictRegion("", "L", "R", 1, 5, "added left").to_dict()],
        annotated_lines=["hello"],
    )
    d = art.to_dict(include_annotated=False)
    assert d["version"] == MERGE_ARTIFACT_VERSION
    assert "annotated_lines" not in d
    d2 = art.to_dict(include_annotated=True)
    assert d2["annotated_lines"] == ["hello"]


def test_merge_report_dict_shape():
    art = MergeArtifact(
        path="f",
        base_sha="a",
        head_sha="b",
        left_line_count=0,
        right_line_count=1,
        merged_line_count=1,
        markers_present=False,
        conflict_regions=[],
        annotated_lines=[],
    )
    r = merge_report_dict(
        run_id="1",
        pr_title="t",
        base_sha="ba",
        head_sha="hb",
        base_ref="main",
        head_ref="dev",
        artifacts=[art],
        include_annotated=False,
    )
    assert r["schema"] == "merge-tonic-report"
    assert len(r["files"]) == 1
    assert r["files"][0]["path"] == "f"


def test_merge_report_dict_embeds_annotated_for_markers():
    art = MergeArtifact(
        path="f",
        base_sha="a",
        head_sha="b",
        left_line_count=1,
        right_line_count=1,
        merged_line_count=1,
        markers_present=True,
        conflict_regions=[],
        annotated_lines=["<<<<<<< begin x", "y"],
    )
    r = merge_report_dict(
        run_id="1",
        pr_title="t",
        base_sha="ba",
        head_sha="hb",
        base_ref="main",
        head_ref="dev",
        artifacts=[art],
        include_annotated=False,
    )
    assert r["files"][0]["annotated_lines"] == ["<<<<<<< begin x", "y"]


def test_merge_report_invariant_marker_files_have_nonempty_annotated_lines():
    """markers_present + embed_annotated_for_marker_files => serialized annotated_lines non-empty."""
    art = MergeArtifact(
        path="f",
        base_sha="a",
        head_sha="b",
        left_line_count=1,
        right_line_count=1,
        merged_line_count=3,
        markers_present=True,
        conflict_regions=[],
        annotated_lines=["<<<<<<< begin added left", "x", "======= begin added left", "y", ">>>>>>> end conflict"],
    )
    r = merge_report_dict(
        run_id="1",
        pr_title="t",
        base_sha="ba",
        head_sha="hb",
        base_ref="main",
        head_ref="dev",
        artifacts=[art],
        include_annotated=False,
        embed_annotated_for_marker_files=True,
    )
    lines = r["files"][0]["annotated_lines"]
    assert isinstance(lines, list) and len(lines) > 0
    assert any(str(ln).startswith("<<<<<<< begin") for ln in lines)
