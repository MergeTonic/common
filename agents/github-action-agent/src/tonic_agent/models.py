"""Conflict models for prompts and GitHub payloads (Tonic-oriented naming)."""

from __future__ import annotations

from dataclasses import dataclass, field

MERGE_ARTIFACT_VERSION = "1"


@dataclass
class ConflictRegion:
    """One conflicting region between left and right versions."""

    base_content: str
    left_content: str
    right_content: str
    start_line: int
    end_line: int
    conflict_kind: str = ""
    left_commit_ids: list[str] = field(default_factory=list)
    right_commit_ids: list[str] = field(default_factory=list)
    """Semantic label from Tonic markers, e.g. 'added left'."""

    def to_dict(self) -> dict:
        return {
            "base_content": self.base_content,
            "left_content": self.left_content,
            "right_content": self.right_content,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "conflict_kind": self.conflict_kind,
            "left_commit_ids": self.left_commit_ids,
            "right_commit_ids": self.right_commit_ids,
        }


@dataclass
class ConflictFile:
    """File path plus structured conflicts and optional full text."""

    path: str
    conflicts: list[ConflictRegion]
    content: str = ""
    left_label: str = "left"
    right_label: str = "right"


@dataclass
class MergeArtifact:
    """JSON-serializable per-file merge output for CI artifacts and extension import."""

    path: str
    base_sha: str
    head_sha: str
    left_line_count: int
    right_line_count: int
    merged_line_count: int
    markers_present: bool
    conflict_regions: list[dict]
    left_commit_id: str = ""
    right_commit_id: str = ""
    annotated_lines: list[str] = field(default_factory=list)
    version: str = MERGE_ARTIFACT_VERSION

    def to_dict(self, *, include_annotated: bool = True) -> dict:
        d: dict = {
            "version": self.version,
            "path": self.path,
            "base_sha": self.base_sha,
            "head_sha": self.head_sha,
            "left_line_count": self.left_line_count,
            "right_line_count": self.right_line_count,
            "merged_line_count": self.merged_line_count,
            "markers_present": self.markers_present,
            "conflict_region_count": len(self.conflict_regions),
            "conflict_regions": self.conflict_regions,
        }
        if include_annotated:
            d["annotated_lines"] = self.annotated_lines
        if self.left_commit_id:
            d["left_commit_id"] = self.left_commit_id
        if self.right_commit_id:
            d["right_commit_id"] = self.right_commit_id
        return d


def merge_report_dict(
    *,
    run_id: str,
    pr_title: str,
    base_sha: str,
    head_sha: str,
    base_ref: str,
    head_ref: str,
    artifacts: list[MergeArtifact],
    include_annotated: bool = False,
    embed_annotated_for_marker_files: bool = True,
    marker_branch: str | None = None,
    marker_branch_commit: str | None = None,
    marker_paths: list[str] | None = None,
    merge_report_artifact_name: str | None = None,
) -> dict:
    """When True, include_annotated embeds annotated_lines for all files; embed_annotated_for_marker_files adds them for conflicted files even if include_annotated is False."""
    files_out: list[dict] = []
    for a in artifacts:
        inc = include_annotated or (
            embed_annotated_for_marker_files and a.markers_present
        )
        files_out.append(a.to_dict(include_annotated=inc))
    out: dict = {
        "schema": "merge-tonic-report",
        "report_version": MERGE_ARTIFACT_VERSION,
        "run_id": run_id,
        "pr_title": pr_title,
        "base_sha": base_sha,
        "head_sha": head_sha,
        "base_ref": base_ref,
        "head_ref": head_ref,
        "files": files_out,
    }
    if marker_branch:
        out["marker_branch"] = marker_branch
    if marker_branch_commit:
        out["marker_branch_commit"] = marker_branch_commit
    if marker_paths:
        out["marker_paths"] = marker_paths
    if merge_report_artifact_name:
        out["merge_report_artifact_name"] = merge_report_artifact_name
    return out
