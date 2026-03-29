"""Git-merge author/intent hydration (parity with @mergetonic/core markerInterop)."""

from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass
from typing import Literal

AuthorMode = Literal["base-head", "human", "ref"]

GIT_MERGE_KIND = "git merge"
DEFAULT_GIT_MERGE_LEFT_INTENT = "preserve_base"
DEFAULT_GIT_MERGE_RIGHT_INTENT = "prefer_head"
DEFAULT_LEFT = "base"
DEFAULT_RIGHT = "head"


def sanitize_author_tag_token(raw: str) -> str:
    s = re.sub(r"\s+", "_", raw.strip())
    s = re.sub(r"[|<>]", "", s)
    if len(s) > 120:
        s = s[:120]
    return s or "unknown"


def format_conflict_label(base_kind: str, tags: dict[str, str] | None = None) -> str:
    kind = base_kind.strip()
    t = tags or {}
    entries = [
        f"{k.strip()}={str(v).strip()}"
        for k, v in sorted(t.items(), key=lambda x: x[0])
        if k.strip()
    ]
    if not entries:
        return kind
    return " | ".join([kind, *entries])


def parse_intent_pair(raw: str) -> tuple[str, str] | None:
    s = raw.strip()
    if not s:
        return None
    parts = [p.strip() for p in s.split(",") if p.strip()]
    if len(parts) != 2:
        return None
    return parts[0], parts[1]


def _email_local_part(email: str) -> str:
    at = email.find("@")
    local = email[:at] if at >= 0 else email
    return sanitize_author_tag_token(local)


def human_alias_from_git_stdout(stdout: str) -> str:
    lines = [ln for ln in stdout.splitlines() if ln.strip()]
    name = (lines[0] if lines else "").strip()
    email = (lines[1] if len(lines) > 1 else "").strip()
    if name:
        return sanitize_author_tag_token(name)
    if email:
        return _email_local_part(email)
    return ""


def _git_show_author(workspace: str, ref: str) -> tuple[int, str]:
    cp = subprocess.run(
        ["git", "-C", workspace, "show", "-s", "--format=%an%n%ae", ref],
        text=True,
        capture_output=True,
        check=False,
    )
    out = (cp.stdout or "") + (("\n" + cp.stderr) if cp.stderr else "")
    return cp.returncode, out


def resolve_author_alias_for_side(
    side: Literal["left", "right"],
    *,
    workspace: str,
    mode: AuthorMode,
    left_ref: str,
    right_ref: str,
    explicit_left: str = "",
    explicit_right: str = "",
    github_login_left: str = "",
    github_login_right: str = "",
) -> str:
    explicit = (explicit_left if side == "left" else explicit_right).strip()
    if explicit:
        return sanitize_author_tag_token(explicit)
    gh = (github_login_left if side == "left" else github_login_right).strip()
    if gh:
        return sanitize_author_tag_token(gh)
    ref = left_ref if side == "left" else right_ref
    if mode == "ref" and ref.strip():
        short = ref.removeprefix("refs/heads/")
        return sanitize_author_tag_token(short)
    if mode == "human" and ref.strip():
        code, stdout = _git_show_author(workspace, ref)
        if code == 0 and stdout.strip():
            alias = human_alias_from_git_stdout(stdout)
            if alias:
                return alias
    return DEFAULT_LEFT if side == "left" else DEFAULT_RIGHT


@dataclass
class GitMergeHydrationOptions:
    author_mode: AuthorMode = "base-head"
    explicit_left_author: str = ""
    explicit_right_author: str = ""
    github_login_left: str = ""
    github_login_right: str = ""
    left_intent: str = ""
    right_intent: str = ""

    def merged_intents(self) -> tuple[str, str]:
        li = (
            self.left_intent.strip() or DEFAULT_GIT_MERGE_LEFT_INTENT
        ).strip() or DEFAULT_GIT_MERGE_LEFT_INTENT
        ri = (
            self.right_intent.strip() or DEFAULT_GIT_MERGE_RIGHT_INTENT
        ).strip() or DEFAULT_GIT_MERGE_RIGHT_INTENT
        return li, ri


def git_merge_hydration_from_env() -> GitMergeHydrationOptions:
    raw_mode = (os.environ.get("INPUT_AUTHOR_MODE") or "").strip().lower()
    mode: AuthorMode
    if raw_mode == "human":
        mode = "human"
    elif raw_mode == "ref":
        mode = "ref"
    else:
        mode = "base-head"
    pair = parse_intent_pair(os.environ.get("INPUT_INTENT_PAIR") or "")
    li, ri = ("", "")
    if pair:
        li, ri = pair
    return GitMergeHydrationOptions(
        author_mode=mode,
        explicit_left_author=os.environ.get("INPUT_AUTHOR_ALIAS_LEFT") or "",
        explicit_right_author=os.environ.get("INPUT_AUTHOR_ALIAS_RIGHT") or "",
        github_login_left=os.environ.get("INPUT_GITHUB_LOGIN_LEFT") or "",
        github_login_right=os.environ.get("INPUT_GITHUB_LOGIN_RIGHT") or "",
        left_intent=li,
        right_intent=ri,
    )


def git_blocks_to_tonic_annotated(
    blocks: list[tuple[list[str], list[str]]],
    *,
    workspace: str,
    base_sha: str,
    head_sha: str,
    opts: GitMergeHydrationOptions | None,
) -> list[str]:
    o = opts or GitMergeHydrationOptions()
    mode = o.author_mode
    left_i, right_i = o.merged_intents()
    out: list[str] = []
    for left, right in blocks:
        left_auth = resolve_author_alias_for_side(
            "left",
            workspace=workspace,
            mode=mode,
            left_ref=base_sha,
            right_ref=head_sha,
            explicit_left=o.explicit_left_author,
            explicit_right=o.explicit_right_author,
            github_login_left=o.github_login_left,
            github_login_right=o.github_login_right,
        )
        right_auth = resolve_author_alias_for_side(
            "right",
            workspace=workspace,
            mode=mode,
            left_ref=base_sha,
            right_ref=head_sha,
            explicit_left=o.explicit_left_author,
            explicit_right=o.explicit_right_author,
            github_login_left=o.github_login_left,
            github_login_right=o.github_login_right,
        )
        ml_begin = format_conflict_label(GIT_MERGE_KIND, {"author": left_auth, "intent": left_i})
        ml_mid = format_conflict_label(GIT_MERGE_KIND, {"author": right_auth, "intent": right_i})
        out.append(f"<<<<<<< begin {ml_begin}")
        out.extend(left)
        out.append(f"======= begin {ml_mid}")
        out.extend(right)
        out.append(">>>>>>> end conflict")
    return out
