"""Intent bootstrap artifact (parity with intentBootstrap.ts)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from tonic.hydration.hydration_prompt_template import apply_hydration_template, load_hydration_prompt_body

DEFAULT_GIT_MERGE_LEFT_INTENT = "preserve_base"
DEFAULT_GIT_MERGE_RIGHT_INTENT = "prefer_head"
DEFAULT_INTENT_PROFILE_PATH = ".tonic/intent-profile.json"


def load_intent_profile(file_path: str) -> dict[str, Any] | None:
    try:
        p = Path(file_path)
        if not p.is_file():
            return None
        j = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(j, dict):
            return j
    except (OSError, json.JSONDecodeError):
        pass
    return None


def parse_intent_pair(raw: str) -> tuple[str, str] | None:
    s = raw.strip()
    if not s:
        return None
    idx = s.find(",")
    if idx < 0:
        return None
    left, right = s[:idx].strip(), s[idx + 1 :].strip()
    if not left or not right:
        return None
    return left, right


def render_bootstrap_excerpt(
    left: str,
    right: str,
    repo_root: str,
    user_query: str = "",
    follow_up: str = "",
) -> str:
    tpl = load_hydration_prompt_body("hydration.intent_bootstrap")
    if tpl and tpl.strip():
        repo_name = Path(repo_root).resolve().name or "."
        return apply_hydration_template(
            tpl,
            {
                "left_intent": left,
                "right_intent": right,
                "repo_name": repo_name,
                "user_query": user_query,
                "follow_up": follow_up,
            },
        )
    return f"Left intent: {left}\nRight intent: {right}"


def resolve_intent_bootstrap(
    *,
    repo_root: str,
    left_intent_flag: str = "",
    right_intent_flag: str = "",
    intent_pair: str = "",
    intent_profile_path: str = "",
    env: dict[str, str],
    prompt_template_id: str = "hydration.intent_bootstrap",
    user_query: str = "",
    follow_up: str = "",
) -> dict[str, Any]:
    sources: dict[str, str] = {}
    left = ""
    right = ""

    profile_path = (intent_profile_path or "").strip() or str(Path(repo_root) / DEFAULT_INTENT_PROFILE_PATH)
    prof = load_intent_profile(profile_path)
    if prof:
        li = str(prof.get("leftIntent") or prof.get("left_intent") or "").strip()
        ri = str(prof.get("rightIntent") or prof.get("right_intent") or "").strip()
        if li:
            left = li
            sources["left"] = "profile_file"
        if ri:
            right = ri
            sources["right"] = "profile_file"

    if (env.get("TONIC_LEFT_INTENT") or "").strip():
        left = env["TONIC_LEFT_INTENT"].strip()
        sources["left"] = "env"
    if (env.get("TONIC_RIGHT_INTENT") or "").strip():
        right = env["TONIC_RIGHT_INTENT"].strip()
        sources["right"] = "env"

    pair = parse_intent_pair(intent_pair)
    if pair:
        left, right = pair
        sources["left"] = "intent_pair"
        sources["right"] = "intent_pair"

    if (left_intent_flag or "").strip():
        left = left_intent_flag.strip()
        sources["left"] = "cli_flag"
    if (right_intent_flag or "").strip():
        right = right_intent_flag.strip()
        sources["right"] = "cli_flag"

    if not left:
        left = DEFAULT_GIT_MERGE_LEFT_INTENT
        sources["left"] = "default"
    if not right:
        right = DEFAULT_GIT_MERGE_RIGHT_INTENT
        sources["right"] = "default"

    uq = (user_query or "").strip()
    fu = (follow_up or "").strip()
    return {
        "schema": "tonic-hydration-intent-bootstrap",
        "version": "1",
        "left_intent": left,
        "right_intent": right,
        "sources": sources,
        "prompt_template_id": prompt_template_id,
        "rendered_excerpt": render_bootstrap_excerpt(left, right, repo_root, uq, fu),
    }


def digest_for_refinement_context(parts: list[str]) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8"))
        h.update(b"\n")
    return h.hexdigest()


def write_intent_bootstrap(path_out: str, art: dict[str, Any]) -> None:
    p = Path(path_out).resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(art, indent=2) + "\n", encoding="utf-8")
