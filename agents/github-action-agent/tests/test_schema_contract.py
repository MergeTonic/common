"""Lightweight contract checks for merge report JSON (complements schema in repo)."""

from tonic_agent.models import MergeArtifact, merge_report_dict


def test_merge_report_top_level_keys_match_contract():
    art = MergeArtifact(
        path="x",
        base_sha="a",
        head_sha="b",
        left_line_count=0,
        right_line_count=0,
        merged_line_count=0,
        markers_present=False,
        conflict_regions=[],
        annotated_lines=[],
    )
    r = merge_report_dict(
        run_id="r",
        pr_title="t",
        base_sha="ba",
        head_sha="hb",
        base_ref="main",
        head_ref="dev",
        artifacts=[art],
        include_annotated=False,
    )
    assert r["schema"] == "merge-tonic-report"
    assert "report_version" in r
    assert "files" in r and isinstance(r["files"], list)
