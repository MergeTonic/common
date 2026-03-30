#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


def _run(cmd: list[str], cwd: Path | None = None, capture: bool = False) -> str:
    if capture:
        return subprocess.check_output(cmd, cwd=str(cwd) if cwd else None, text=True).strip()
    subprocess.check_call(cmd, cwd=str(cwd) if cwd else None)
    return ""


def _api(method: str, url: str, token: str, payload: dict[str, Any] | None = None) -> Any:
    data = None
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "mergetonic-acceptance-writer",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _repo_default_branch(repo: str, token: str) -> str:
    url = f"https://api.github.com/repos/{repo}"
    obj = _api("GET", url, token)
    return str(obj.get("default_branch", "")).strip()


def _append_output(key: str, value: str) -> None:
    out = os.getenv("GITHUB_OUTPUT")
    if not out:
        return
    with open(out, "a", encoding="utf-8") as fh:
        fh.write(f"{key}={value}\n")


def _parse_command(body: str) -> bool:
    if "/accept-terms" not in body:
        return False
    return "contributing=yes" in body and "license=yes" in body


def _load_event(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _upsert_acceptance_file(
    registry_path: Path,
    actor_login: str,
    source_repo: str,
    source_pr: str,
    policy_version: str,
) -> bool:
    now = dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    obj = json.loads(registry_path.read_text(encoding="utf-8"))
    records = obj.setdefault("records", [])
    found = None
    for rec in records:
        if str(rec.get("github_login", "")).lower() == actor_login.lower():
            found = rec
            break
    changed = False
    if found is None:
        found = {"github_login": actor_login}
        records.append(found)
        changed = True
    before = json.dumps(found, sort_keys=True)
    found["accepted_contributing_at"] = found.get("accepted_contributing_at") or now
    found["accepted_license_at"] = found.get("accepted_license_at") or now
    found["accepted_policy_version"] = policy_version
    found["accepted_via"] = "pr_comment_gate"
    found["source_repo"] = source_repo
    found["source_pr"] = source_pr
    found["active"] = True
    after = json.dumps(found, sort_keys=True)
    if before != after:
        changed = True
    obj["last_updated_at"] = now
    obj["records"] = sorted(records, key=lambda r: str(r.get("github_login", "")).lower())
    registry_path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")
    return changed


def _post_issue_comment(repo: str, issue_number: int, token: str, body: str) -> None:
    _api(
        "POST",
        f"https://api.github.com/repos/{repo}/issues/{issue_number}/comments",
        token,
        {"body": body},
    )


def _extract_pr_details(event: dict[str, Any], token: str) -> tuple[str, int, str]:
    issue = event.get("issue") or {}
    pr_ref = issue.get("pull_request") or {}
    if not pr_ref:
        raise SystemExit("Not a PR comment event")
    pr = _api("GET", pr_ref["url"], token)
    source_repo = ((pr.get("base") or {}).get("repo") or {}).get("full_name") or ""
    pr_number = int(pr.get("number") or 0)
    head_ref = ((pr.get("head") or {}).get("ref") or "")
    if not source_repo or not pr_number or not head_ref:
        raise SystemExit("Missing PR metadata")
    return source_repo, pr_number, head_ref


def _open_or_update_pr(common_repo: str, branch: str, token: str, title: str, body: str) -> str:
    prs = _api(
        "GET",
        f"https://api.github.com/repos/{common_repo}/pulls?state=open&head={urllib.parse.quote(common_repo.split('/')[0] + ':' + branch)}&base=main",
        token,
    )
    if prs:
        return prs[0]["html_url"]
    created = _api(
        "POST",
        f"https://api.github.com/repos/{common_repo}/pulls",
        token,
        {"title": title, "head": branch, "base": "main", "body": body},
    )
    return created["html_url"]


def run_apply(args: argparse.Namespace) -> int:
    token = args.token or os.getenv("POLICY_BOT_TOKEN") or os.getenv("GITHUB_TOKEN") or ""
    if not token:
        raise SystemExit("Missing token")
    event = _load_event(args.event_path or os.getenv("GITHUB_EVENT_PATH") or "")
    comment_body = ((event.get("comment") or {}).get("body") or "").strip()
    actor = ((event.get("comment") or {}).get("user") or {}).get("login") or os.getenv("GITHUB_ACTOR") or ""
    if not actor:
        raise SystemExit("Missing actor")
    if not _parse_command(comment_body):
        print("No valid /accept-terms command found; exiting.")
        return 0
    source_repo, source_pr, source_head_ref = _extract_pr_details(event, token)
    event_repo = ((event.get("repository") or {}).get("full_name") or os.getenv("GITHUB_REPOSITORY") or "")
    common_repo = args.common_repo
    issue_number = int((event.get("issue") or {}).get("number") or 0)

    with tempfile.TemporaryDirectory(prefix="mt-policy-") as td:
        tmp = Path(td)
        checkout = tmp / "repo"
        _run(["git", "clone", f"https://x-access-token:{token}@github.com/{common_repo}.git", str(checkout)])
        common_ref = (args.common_ref or "").strip()
        if not common_ref:
            common_ref = _repo_default_branch(common_repo, token)
        _run(["git", "checkout", common_ref], cwd=checkout)
        registry_path = checkout / ".github" / "contributor-acceptance.json"
        changed = _upsert_acceptance_file(
            registry_path=registry_path,
            actor_login=actor,
            source_repo=source_repo,
            source_pr=f"{source_pr}",
            policy_version=args.policy_version,
        )
        if not changed:
            _append_output("status", "noop")
            _post_issue_comment(
                event_repo,
                issue_number,
                token,
                f"Acceptance already recorded for `{actor}` on policy `{args.policy_version}`.",
            )
            return 0

        _run(["git", "add", ".github/contributor-acceptance.json"], cwd=checkout)
        _run(["git", "config", "user.name", "mergetonic-policy-bot"], cwd=checkout)
        _run(["git", "config", "user.email", "policy-bot@users.noreply.github.com"], cwd=checkout)
        _run(
            [
                "git",
                "commit",
                "-m",
                f"policy: record acceptance for {actor}",
            ],
            cwd=checkout,
        )

        if source_repo == common_repo and event_repo == common_repo:
            branch = source_head_ref
            _run(["git", "push", "origin", f"HEAD:{branch}"], cwd=checkout)
            _append_output("status", "committed_to_pr_branch")
            _post_issue_comment(
                event_repo,
                issue_number,
                token,
                f"Recorded acceptance for `{actor}` and pushed update to branch `{branch}`.",
            )
            return 0

        branch = f"acceptance/{actor.lower()}/{dt.datetime.now(dt.UTC).strftime('%Y%m%d%H%M%S')}"
        _run(["git", "checkout", "-b", branch], cwd=checkout)
        _run(["git", "push", "-u", "origin", branch], cwd=checkout)
        pr_url = _open_or_update_pr(
            common_repo=common_repo,
            branch=branch,
            token=token,
            title=f"policy: record acceptance for {actor}",
            body=f"Automated acceptance writeback for `{actor}` from `{source_repo}` PR #{source_pr}.",
        )
        _append_output("status", "opened_common_pr")
        _append_output("common_pr_url", pr_url)
        _post_issue_comment(
            event_repo,
            issue_number,
            token,
            f"Recorded acceptance for `{actor}` by opening PR in `{common_repo}`: {pr_url}",
        )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event-path", default="")
    parser.add_argument("--token", default="")
    parser.add_argument("--common-repo", default=os.getenv("MERGETONIC_COMMON_REPO", "mergetonic/common"))
    parser.add_argument("--common-ref", default=os.getenv("MERGETONIC_COMMON_REF", ""))
    parser.add_argument("--policy-version", default=os.getenv("MERGETONIC_POLICY_VERSION", "2026-03-27.1"))
    args = parser.parse_args()
    try:
        return run_apply(args)
    except urllib.error.HTTPError as err:
        print(f"GitHub API error: {err}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
