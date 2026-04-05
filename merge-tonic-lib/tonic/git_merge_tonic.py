"""Convert `git merge-file` output (Git markers) into Tonic annotated lines."""

from __future__ import annotations

from .git_conflict_parser import parse_git_conflicts


def _region_to_tonic_lines(
    *,
    left_author: str,
    right_author: str,
    left_intent: str,
    right_intent: str,
    left_content: str,
    right_content: str,
) -> list[str]:
    begin = f"git merge author={left_author} intent={left_intent}"
    mid = f"git merge author={right_author} intent={right_intent}"
    out = [f"<<<<<<< begin {begin}"]
    out.extend(left_content.splitlines() if left_content else [])
    out.append(f"======= begin {mid}")
    out.extend(right_content.splitlines() if right_content else [])
    out.append(">>>>>>> end conflict")
    return out


def git_merge_file_output_to_tonic_annotated(
    merged_git: str,
    *,
    left_author: str = "left",
    right_author: str = "right",
    left_intent: str = "preserve_base",
    right_intent: str = "prefer_head",
) -> list[str]:
    raw_lines = merged_git.splitlines()
    if raw_lines and raw_lines[-1] == "":
        raw_lines = raw_lines[:-1]
    blocks = parse_git_conflicts(merged_git)
    if not blocks:
        return raw_lines
    tonic_chunks: list[list[str]] = []
    for b in blocks:
        seg0, seg1 = b.segments[0], b.segments[1]
        tonic_chunks.append(
            _region_to_tonic_lines(
                left_author=left_author,
                right_author=right_author,
                left_intent=left_intent,
                right_intent=right_intent,
                left_content="\n".join(seg0.lines),
                right_content="\n".join(seg1.lines),
            )
        )
    out: list[str] = []
    idx = 0
    for bi, b in enumerate(blocks):
        while idx < b.start_line:
            out.append(raw_lines[idx])
            idx += 1
        out.extend(tonic_chunks[bi])
        idx = b.end_line + 1
    while idx < len(raw_lines):
        out.append(raw_lines[idx])
        idx += 1
    return out
