#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

COMMENT_MARKER = "<!-- mergetonic:contributor-policy-gate -->"


def _api_request(
    method: str,
    url: str,
    token: str,
    payload: dict[str, Any] | None = None,
) -> Any:
    data = None
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "mergetonic-contributor-policy",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _parse_coauthors(message: str) -> set[str]:
    out: set[str] = set()
    for line in message.splitlines():
        if "Co-authored-by:" not in line:
            continue
        m = re.search(r"<([^>]+)>", line)
        if not m:
            continue
        email = m.group(1).strip().lower()
        # Common GitHub noreply formats:
        # 12345+login@users.noreply.github.com
        # login@users.noreply.github.com
        if email.endswith("@users.noreply.github.com"):
            local = email.split("@", 1)[0]
            if "+" in local:
                local = local.split("+", 1)[1]
            if local:
                out.add(local)
    return out


def _collect_pr_contributors(repo: str, pr_number: int, token: str) -> list[str]:
    url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}/commits?per_page=100"
    commits = _api_request("GET", url, token)
    users: set[str] = set()
    for c in commits:
        author = (c.get("author") or {}).get("login")
        committer = (c.get("committer") or {}).get("login")
        if author:
            users.add(author.lower())
        if committer:
            users.add(committer.lower())
        msg = ((c.get("commit") or {}).get("message") or "")
        users.update(_parse_coauthors(msg))
    return sorted(users)


def _load_canonical_registry(common_repo: str, common_ref: str, token: str) -> dict[str, Any]:
    path = urllib.parse.quote(".github/contributor-acceptance.json", safe="")
    url = f"https://api.github.com/repos/{common_repo}/contents/{path}?ref={urllib.parse.quote(common_ref)}"
    obj = _api_request("GET", url, token)
    content = base64.b64decode(obj["content"]).decode("utf-8")
    return json.loads(content)


def _accepted_logins(registry: dict[str, Any]) -> set[str]:
    accepted: set[str] = set()
    for rec in registry.get("records", []):
        if not rec.get("active", False):
            continue
        if not rec.get("accepted_contributing_at") or not rec.get("accepted_license_at"):
            continue
        login = str(rec.get("github_login", "")).strip().lower()
        if login:
            accepted.add(login)
    return accepted


def _build_comment_body(
    missing: list[str],
    common_repo: str,
    policy_version: str,
) -> str:
    missing_lines = "\n".join(f"- `{m}`" for m in missing) if missing else "- none"
    terms_base = f"https://github.com/{common_repo}/blob/main/.github"
    return f"""{COMMENT_MARKER}
## Contribution and License Acceptance Required

This PR cannot merge yet because one or more contributors have not accepted required terms.

### Missing acceptance
{missing_lines}

### Terms checklist
- [ ] I accept [CONTRIBUTOR_TERMS.md]({terms_base}/CONTRIBUTOR_TERMS.md)
- [ ] I accept [LICENSE_TERMS.md]({terms_base}/LICENSE_TERMS.md)

### Gated command
Comment on this PR with:

`/accept-terms contributing=yes license=yes`

Policy version: `{policy_version}`
"""


def _upsert_pr_comment(repo: str, pr_number: int, token: str, body: str) -> None:
    issue_comments_url = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments?per_page=100"
    comments = _api_request("GET", issue_comments_url, token)
    existing_id = None
    for c in comments:
        if COMMENT_MARKER in (c.get("body") or ""):
            existing_id = c.get("id")
            break
    if existing_id:
        _api_request(
            "PATCH",
            f"https://api.github.com/repos/{repo}/issues/comments/{existing_id}",
            token,
            {"body": body},
        )
    else:
        _api_request(
            "POST",
            f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments",
            token,
            {"body": body},
        )


def _write_outputs(status: str, contributors: list[str], missing: list[str]) -> None:
    out = os.getenv("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write(f"status={status}\n")
            fh.write(f"contributors_json={json.dumps(contributors)}\n")
            fh.write(f"missing_json={json.dumps(missing)}\n")
            fh.write(f"missing_count={len(missing)}\n")
    print(json.dumps({"status": status, "contributors": contributors, "missing": missing}))


def run_gate(args: argparse.Namespace) -> int:
    token = args.token or os.getenv("GITHUB_TOKEN") or ""
    if not token:
        print("GITHUB_TOKEN is required", file=sys.stderr)
        return 2
    event_path = args.event_path or os.getenv("GITHUB_EVENT_PATH") or ""
    if not event_path:
        print("GITHUB_EVENT_PATH is required", file=sys.stderr)
        return 2

    event = json.loads(open(event_path, encoding="utf-8").read())
    pr = event.get("pull_request") or {}
    pr_number = int(pr.get("number") or event.get("number") or 0)
    repo = args.repo or os.getenv("GITHUB_REPOSITORY") or ""
    if not repo or not pr_number:
        print("pull_request context is required", file=sys.stderr)
        return 2

    common_repo = args.common_repo
    common_ref = args.common_ref
    try:
        contributors = _collect_pr_contributors(repo, pr_number, token)
        registry = _load_canonical_registry(common_repo, common_ref, token)
    except urllib.error.HTTPError as err:
        print(f"GitHub API error: {err}", file=sys.stderr)
        return 2

    accepted = _accepted_logins(registry)
    missing = [u for u in contributors if u not in accepted]
    status = "ok" if not missing else "blocked"
    _write_outputs(status, contributors, missing)
    if missing:
        try:
            _upsert_pr_comment(repo, pr_number, token, _build_comment_body(missing, common_repo, registry.get("policy_version", "")))
        except urllib.error.HTTPError as err:
            # Lack of comment permissions should not hide a hard policy failure.
            print(f"warning: failed to upsert comment: {err}", file=sys.stderr)
    return 0 if not missing else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    gate = sub.add_parser("gate")
    gate.add_argument("--token", default="")
    gate.add_argument("--event-path", default="")
    gate.add_argument("--repo", default="")
    gate.add_argument("--common-repo", default=os.getenv("MERGETONIC_COMMON_REPO", "mergetonic/common"))
    gate.add_argument("--common-ref", default=os.getenv("MERGETONIC_COMMON_REF", "main"))
    args = parser.parse_args()
    if args.cmd == "gate":
        return run_gate(args)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
