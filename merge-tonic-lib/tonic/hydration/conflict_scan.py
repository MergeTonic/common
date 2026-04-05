"""Conflict marker scan (parity with conflictScan.ts semantics)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from tonic.git_conflict_parser import parse_git_conflicts


def _walk_rel_paths(repo: Path) -> list[str]:
    out: list[str] = []
    skip = {".git", "node_modules", ".tonic"}

    def walk(base: Path, rel: str) -> None:
        try:
            for e in base.iterdir():
                if e.name in skip:
                    continue
                r = f"{rel}/{e.name}".strip("/") if rel else e.name
                r = r.replace("\\", "/")
                if e.is_dir():
                    walk(e, r)
                elif e.is_file():
                    out.append(r)
        except OSError:
            return

    walk(repo, "")
    return sorted(out)


def scan_repo_conflict_markers(repo: Path) -> dict[str, Any]:
    regions: list[dict[str, Any]] = []
    rid = 0
    for rel in _walk_rel_paths(repo):
        parts = [x for x in rel.replace("\\", "/").split("/") if x]
        abs_p = repo.joinpath(*parts) if parts else repo
        try:
            text = abs_p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        blocks = parse_git_conflicts(text)
        for b in blocks:
            rid += 1
            start_1 = b.start_line + 1
            end_1 = b.end_line + 1
            mid = (start_1 + end_1) // 2
            ours = b.segments[0].label if b.segments else ""
            theirs = b.segments[1].label if len(b.segments) > 1 else ""
            row: dict[str, Any] = {
                "path": rel.replace("\\", "/"),
                "region_id": f"r{rid}",
                "start_line": start_1,
                "mid_line": mid,
                "end_line": end_1,
            }
            if ours:
                row["ours_label"] = ours
            if theirs:
                row["theirs_label"] = theirs
            regions.append(row)
    regions.sort(key=lambda x: (x["path"], x["start_line"]))
    return {
        "schema": "tonic-conflict-context",
        "version": "1",
        "scan_scope": "workspace",
        "conflict_regions": regions,
    }


def write_conflict_context(path_out: str, art: dict[str, Any]) -> None:
    p = Path(path_out).resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(art, indent=2) + "\n", encoding="utf-8")
