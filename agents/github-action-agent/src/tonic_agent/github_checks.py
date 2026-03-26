"""Optional GitHub Check runs with annotations (needs checks: write on the token)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from .head_line_map import conflict_region_to_head_span_result
from .merge import annotated_to_conflict_file
from .models import MergeArtifact


def _api_root() -> str:
    return os.environ.get("GITHUB_API_URL", "https://api.github.com").rstrip("/")


def _request(
    method: str,
    url: str,
    token: str,
    body: dict[str, Any] | None = None,
) -> dict[str, Any] | list[Any]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"GitHub API {e.code}: {e.read().decode('utf-8', errors='replace')}") from e


def post_tonic_check(
    owner: str,
    repo: str,
    head_sha: str,
    token: str,
    artifacts: list[MergeArtifact],
    pairs: dict[str, tuple[list[str], list[str], Any]],
) -> None:
    """Create a completed check run with up to 50 annotations."""
    api = _api_root()
    annotations: list[dict[str, Any]] = []
    conflict_files = 0
    file_unmapped: dict[str, int] = {}
    file_ambiguous: dict[str, int] = {}

    for a in artifacts:
        if not a.markers_present:
            continue
        conflict_files += 1
        path = a.path
        right_lines = pairs[path][1]
        cf = annotated_to_conflict_file(path, a.annotated_lines)
        prefer_after = 0
        for reg in cf.conflicts:
            res = conflict_region_to_head_span_result(
                reg, right_lines, prefer_after_line_0=prefer_after
            )
            if res["kind"] == "unique":
                prefer_after = res["span"][1]
                h_start, h_end = res["span"]
                if len(annotations) < 50:
                    annotations.append(
                        {
                            "path": path,
                            "start_line": h_start,
                            "end_line": h_end,
                            "annotation_level": "warning",
                            "message": (
                                f"Tonic conflict ({reg.conflict_kind}) — inline review mapped"
                            ),
                        }
                    )
            elif res["kind"] == "ambiguous":
                file_ambiguous[path] = file_ambiguous.get(path, 0) + 1
            else:
                file_unmapped[path] = file_unmapped.get(path, 0) + 1

    for p in sorted(set(file_unmapped) | set(file_ambiguous)):
        if len(annotations) >= 50:
            break
        u = file_unmapped.get(p, 0)
        amb = file_ambiguous.get(p, 0)
        if u == 0 and amb == 0:
            continue
        parts: list[str] = []
        if amb:
            parts.append(f"{amb} ambiguous head span(s)")
        if u:
            parts.append(f"{u} unmapped region(s)")
        annotations.append(
            {
                "path": p,
                "start_line": 1,
                "end_line": 1,
                "annotation_level": "notice",
                "message": (
                    "Tonic: "
                    + "; ".join(parts)
                    + " — see PR issue / marker branch for full markers"
                ),
            }
        )

    conclusion = "neutral" if conflict_files else "success"
    summary = (
        f"{conflict_files} file(s) with Tonic conflict markers. "
        f"{len(annotations)} annotation(s) attached (capped at 50)."
    )
    body = {
        "name": "Tonic merge",
        "head_sha": head_sha,
        "status": "completed",
        "conclusion": conclusion,
        "output": {
            "title": "Tonic pairwise merge",
            "summary": summary,
            "annotations": annotations[:50],
        },
    }
    url = f"{api}/repos/{owner}/{repo}/check-runs"
    _request("POST", url, token, body)
