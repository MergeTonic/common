"""Two-snapshot merge bridge (parity with @mergetonic/core mergeUtils)."""

from __future__ import annotations

from tonic import current_lines, initial_state, merge_states


def merge_snapshots(
    left_lines: list[str],
    right_lines: list[str],
    *,
    left_commit_id: str = "",
    right_commit_id: str = "",
) -> tuple[list[str], list[str]]:
    """Merge two file snapshots using Tonic weave states (no shared history)."""
    merged_state, annotated = merge_states(
        initial_state(left_lines, commit_id=left_commit_id or None),
        initial_state(right_lines, commit_id=right_commit_id or None),
    )
    return current_lines(merged_state), annotated


class ConflictRegion:
    __slots__ = (
        "base_content",
        "left_content",
        "right_content",
        "start_line",
        "end_line",
        "conflict_kind",
        "left_commit_ids",
        "right_commit_ids",
    )

    def __init__(
        self,
        *,
        base_content: str = "",
        left_content: str = "",
        right_content: str = "",
        start_line: int = 0,
        end_line: int = 0,
        conflict_kind: str = "",
        left_commit_ids: list[str] | None = None,
        right_commit_ids: list[str] | None = None,
    ) -> None:
        self.base_content = base_content
        self.left_content = left_content
        self.right_content = right_content
        self.start_line = start_line
        self.end_line = end_line
        self.conflict_kind = conflict_kind
        self.left_commit_ids = list(left_commit_ids or [])
        self.right_commit_ids = list(right_commit_ids or [])

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


class ConflictFile:
    __slots__ = ("path", "conflicts", "content")

    def __init__(self, path: str, conflicts: list[ConflictRegion], content: str = "") -> None:
        self.path = path
        self.conflicts = conflicts
        self.content = content


def annotated_to_conflict_file(path: str, annotated_lines: list[str]) -> ConflictFile:
    """Each `<<<<<<< begin` … `>>>>>>> end` block becomes one region (1-based line numbers)."""
    text = "\n".join(annotated_lines)
    conflicts: list[ConflictRegion] = []
    i = 0
    n = len(annotated_lines)
    while i < n:
        line = annotated_lines[i]
        if not line.startswith("<<<<<<< begin "):
            i += 1
            continue
        kind = line.removeprefix("<<<<<<< begin ").strip()
        start_line = i + 1
        i += 1
        inner: list[str] = []
        while i < n and not annotated_lines[i].startswith(">>>>>>> end conflict"):
            inner.append(annotated_lines[i])
            i += 1
        end_line = i + 1 if i < n else n
        left_lines: list[str] = []
        right_lines: list[str] = []
        seen_mid = False
        for cl in inner:
            if cl.startswith("======= begin "):
                seen_mid = True
                continue
            if not seen_mid:
                left_lines.append(cl)
            else:
                right_lines.append(cl)
        conflicts.append(
            ConflictRegion(
                left_content="\n".join(left_lines),
                right_content="\n".join(right_lines),
                start_line=start_line,
                end_line=end_line,
                conflict_kind=kind,
            )
        )
        if i < n and annotated_lines[i].startswith(">>>>>>> end conflict"):
            i += 1
    return ConflictFile(path=path, conflicts=conflicts, content=text)


def heuristic_resolved_lines(region: ConflictRegion) -> list[str]:
    """Prefer head (right) hunk; else left when right empty (parity with @mergetonic/core)."""
    rc = region.right_content.splitlines() if region.right_content else []
    if rc:
        return rc
    return region.left_content.splitlines() if region.left_content else []


def suggestion_line_count_ok(resolved_lines: list[str], head_span_line_count: int) -> bool:
    return len(resolved_lines) == head_span_line_count


def apply_tonic_resolutions(
    annotated_lines: list[str],
    resolved_per_region: list[list[str]],
) -> list[str]:
    """Replace each Tonic conflict region with resolved lines (bottom-up splice)."""
    cf = annotated_to_conflict_file("_", annotated_lines)
    if len(resolved_per_region) != len(cf.conflicts):
        msg = f"apply_tonic_resolutions: expected {len(cf.conflicts)} region resolutions, got {len(resolved_per_region)}"
        raise ValueError(msg)
    order = sorted(enumerate(cf.conflicts), key=lambda x: x[1].start_line, reverse=True)
    lines = list(annotated_lines)
    for i, r in order:
        start = r.start_line - 1
        delete_count = r.end_line - r.start_line + 1
        lines[start : start + delete_count] = resolved_per_region[i]
    return lines


def apply_tonic_heuristic(annotated_lines: list[str]) -> list[str]:
    cf = annotated_to_conflict_file("_", annotated_lines)
    resolved = [heuristic_resolved_lines(c) for c in cf.conflicts]
    return apply_tonic_resolutions(annotated_lines, resolved)


MERGE_ARTIFACT_VERSION = "1"


def artifact_dict(
    path: str,
    *,
    base_sha: str = "local",
    head_sha: str = "local",
    left_lines: list[str],
    right_lines: list[str],
    merged_lines: list[str],
    annotated_lines: list[str],
    include_annotated: bool = True,
    include_blame: bool = False,
    left_commit_id: str = "",
    right_commit_id: str = "",
    blame_max_commits: int = 3,
) -> dict:
    """Single file merge artifact matching merge-tonic-report file entries."""
    cf = annotated_to_conflict_file(path, annotated_lines)
    if include_blame:
        left_ids = [left_commit_id] if left_commit_id else []
        right_ids = [right_commit_id] if right_commit_id else []
        if blame_max_commits > 0:
            left_ids = left_ids[:blame_max_commits]
            right_ids = right_ids[:blame_max_commits]
        for c in cf.conflicts:
            c.left_commit_ids = left_ids
            c.right_commit_ids = right_ids
    markers_present = any(ln.startswith("<<<<<<< begin") for ln in annotated_lines)
    d: dict = {
        "version": MERGE_ARTIFACT_VERSION,
        "path": path,
        "base_sha": base_sha,
        "head_sha": head_sha,
        "left_line_count": len(left_lines),
        "right_line_count": len(right_lines),
        "merged_line_count": len(merged_lines),
        "markers_present": markers_present,
        "conflict_region_count": len(cf.conflicts),
        "conflict_regions": [c.to_dict() for c in cf.conflicts],
    }
    if include_blame:
        if left_commit_id:
            d["left_commit_id"] = left_commit_id
        if right_commit_id:
            d["right_commit_id"] = right_commit_id
    if include_annotated and markers_present:
        d["annotated_lines"] = annotated_lines
    return d


def minimal_merge_report(
    *,
    run_id: str = "cli",
    pr_title: str = "cli",
    base_sha: str = "local",
    head_sha: str = "local",
    base_ref: str = "",
    head_ref: str = "",
    artifacts: list[dict],
) -> dict:
    return {
        "schema": "merge-tonic-report",
        "report_version": MERGE_ARTIFACT_VERSION,
        "run_id": run_id,
        "pr_title": pr_title,
        "base_sha": base_sha,
        "head_sha": head_sha,
        "base_ref": base_ref,
        "head_ref": head_ref,
        "files": artifacts,
    }
