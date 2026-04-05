"""Repo structure summary (parity with repoStructure.ts)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def summarize_repo_structure(repo_root: str, max_depth: int = 2) -> dict[str, Any]:
    top: list[str] = []
    try:
        for e in sorted(Path(repo_root).iterdir(), key=lambda x: x.name):
            if e.name in (".git", "node_modules", ".tonic"):
                continue
            top.append(e.name)
    except OSError:
        pass
    return {
        "schema": "tonic-repo-structure",
        "version": "1",
        "repo_root": str(Path(repo_root).resolve()).replace("\\", "/"),
        "top_level": top,
        "max_depth": max_depth,
    }


def repo_structure_excerpt(art: dict[str, Any]) -> str:
    tl = art.get("top_level") or []
    if isinstance(tl, list):
        return "Top-level: " + ", ".join(str(x) for x in tl)
    return "Top-level: "


def write_repo_structure(path_out: str, art: dict[str, Any]) -> None:
    p = Path(path_out).resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(art, indent=2) + "\n", encoding="utf-8")
