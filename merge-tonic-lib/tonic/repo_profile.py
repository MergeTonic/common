"""Read/write `.tonic/repo.json` (tonic-repo-profile v1) with idempotent merge semantics."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, TypedDict

TONIC_REPO_PROFILE_SCHEMA = "tonic-repo-profile"
TONIC_REPO_PROFILE_VERSION = "1"
DEFAULT_REPO_PROFILE_REL = Path(".tonic") / "repo.json"


class TonicRepoProfileV1(TypedDict, total=False):
    schema: str
    version: str
    remote: str
    canonical_ref: str
    left_ref: str
    right_ref: str
    intent_pair: str
    intent_profile: str
    hydrate_out_dir: str
    git_remote_url: str
    hub_repo_id: str
    hub_default_dag: bool
    replay_trace_source: str
    hub_index_path: str
    compare_mode: str


def default_repo_profile() -> TonicRepoProfileV1:
    return {
        "schema": TONIC_REPO_PROFILE_SCHEMA,
        "version": TONIC_REPO_PROFILE_VERSION,
        "remote": "origin",
        "canonical_ref": "",
        "left_ref": "",
        "right_ref": "",
        "intent_pair": "",
        "intent_profile": "",
        "hydrate_out_dir": "",
        "git_remote_url": "",
        "hub_repo_id": "",
        "hub_default_dag": False,
        "replay_trace_source": "auto",
        "hub_index_path": "",
        "compare_mode": "snapshot",
    }


def parse_repo_profile_json(raw: str) -> TonicRepoProfileV1:
    try:
        data: Any = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError("repo profile: invalid JSON") from e
    if not isinstance(data, dict):
        raise ValueError("repo profile: root must be object")
    if data.get("schema") != TONIC_REPO_PROFILE_SCHEMA:
        raise ValueError(f"repo profile: schema must be {TONIC_REPO_PROFILE_SCHEMA}")
    if data.get("version") != TONIC_REPO_PROFILE_VERSION:
        raise ValueError(f"repo profile: version must be {TONIC_REPO_PROFILE_VERSION}")
    remote = data.get("remote", "")
    if not isinstance(remote, str) or not remote.strip():
        raise ValueError("repo profile: remote must be non-empty string")
    cm = data.get("compare_mode", "snapshot")
    if cm not in ("snapshot", "weave", "", None):
        raise ValueError('repo profile: compare_mode must be "snapshot" or "weave"')
    base = default_repo_profile()
    extra = (
        "git_remote_url",
        "hub_repo_id",
        "hub_default_dag",
        "replay_trace_source",
        "hub_index_path",
    )
    for k, v in data.items():
        if k in base or k in extra:
            base[k] = v  # type: ignore[literal-required]
    base["remote"] = str(remote).strip()
    return base


def merge_repo_profiles(base: TonicRepoProfileV1, patch: dict[str, Any]) -> TonicRepoProfileV1:
    out: dict[str, Any] = {**default_repo_profile(), **base}
    for k, v in patch.items():
        if v is None:
            continue
        if isinstance(v, str):
            if v.strip():
                out[k] = v.strip()
            continue
        if k == "compare_mode" and v in ("snapshot", "weave"):
            out[k] = v
            continue
        if k == "hub_default_dag" and isinstance(v, bool):
            out[k] = v
            continue
        if k == "replay_trace_source" and v in ("local", "hub", "auto"):
            out[k] = v
            continue
        if k == "hub_index_path" and isinstance(v, str) and v.strip():
            out[k] = v.strip()
    out["schema"] = TONIC_REPO_PROFILE_SCHEMA
    out["version"] = TONIC_REPO_PROFILE_VERSION
    return out  # type: ignore[return-value]


def repo_profile_path(repo_root: str | Path, rel: Path | None = None) -> Path:
    r = Path(repo_root).resolve()
    return r / (rel or DEFAULT_REPO_PROFILE_REL)


def read_repo_profile(repo_root: str | Path) -> TonicRepoProfileV1 | None:
    p = repo_profile_path(repo_root)
    if not p.is_file():
        return None
    return parse_repo_profile_json(p.read_text(encoding="utf-8"))


def write_repo_profile(repo_root: str | Path, profile: TonicRepoProfileV1, rel: Path | None = None) -> None:
    p = repo_profile_path(repo_root, rel)
    p.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(profile, indent=2, sort_keys=True) + "\n"
    p.write_text(body, encoding="utf-8")


def refs_to_fetch_from_profile(p: TonicRepoProfileV1) -> list[str]:
    s: set[str] = set()
    for r in (p.get("canonical_ref"), p.get("left_ref"), p.get("right_ref")):
        t = (r or "").strip()
        if t:
            s.add(t)
    return sorted(s)
