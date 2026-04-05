"""`merge-tonic repo` composite commands (parity with TS repoSubcommands)."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from tonic.git_cli import cmd_git_compare, cmd_git_compare_three, cmd_git_fetch
from tonic.hydration_pipeline import cmd_hydrate
from tonic.remote_spec import resolve_remote_spec
from tonic.repo_profile import (
    default_repo_profile,
    merge_repo_profiles,
    read_repo_profile,
    refs_to_fetch_from_profile,
    repo_profile_path,
    write_repo_profile,
)
from tonic.weave_git.manifest import parse_manifest_json


def _ensure_weave_init_idempotent(repo: Path) -> None:
    root = repo / ".tonic" / "weave"
    man_path = root / "manifest.json"
    root.mkdir(parents=True, exist_ok=True)
    (root / "blobs").mkdir(parents=True, exist_ok=True)
    if man_path.is_file():
        try:
            parse_manifest_json(man_path.read_text(encoding="utf-8"))
            return
        except Exception:
            pass
    man = {
        "schema": "tonic-git-manifest",
        "version": "1",
        "commit": "0000000000000000000000000000000000000000",
        "paths": {},
    }
    man_path.write_text(json.dumps(man, indent=2) + "\n", encoding="utf-8")


def _collect_fetch_refs(argv: list[str]) -> list[str]:
    out: list[str] = []
    i = 0
    while i < len(argv):
        if argv[i] in ("--branch", "--ref") and i + 1 < len(argv) and not argv[i + 1].startswith("-"):
            out.append(argv[i + 1])
            i += 2
            continue
        i += 1
    return out


def cmd_repo_init(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    repo.mkdir(parents=True, exist_ok=True)
    (repo / ".tonic").mkdir(parents=True, exist_ok=True)
    _ensure_weave_init_idempotent(repo)

    existing = read_repo_profile(repo)
    patch: dict = {}
    if getattr(args, "remote", None):
        patch["remote"] = str(args.remote).strip()
    for attr, key in (
        ("canonical_ref", "canonical_ref"),
        ("left_ref", "left_ref"),
        ("right_ref", "right_ref"),
        ("intent_pair", "intent_pair"),
        ("intent_profile", "intent_profile"),
        ("hydrate_out_dir", "hydrate_out_dir"),
        ("hub_repo_id", "hub_repo_id"),
        ("git_remote_url", "git_remote_url"),
    ):
        v = getattr(args, attr, None)
        if v and str(v).strip():
            patch[key] = str(v).strip()
    cm = (getattr(args, "compare_mode", None) or "").strip().lower()
    if cm in ("weave", "snapshot"):
        patch["compare_mode"] = cm

    merged = merge_repo_profiles(existing or default_repo_profile(), patch)
    write_repo_profile(repo, merged)

    if getattr(args, "hub_create", False):
        rid = (merged.get("hub_repo_id") or "").strip()
        if not rid:
            print("repo init --hub-create requires --hub-repo-id or hub_repo_id in profile", file=sys.stderr)
            return 1
        try:
            from tonic.hf_weave.client import hub_create_repo_if_needed

            hub_create_repo_if_needed(repo_id=rid, private=bool(getattr(args, "hub_private", True)))
        except Exception as e:
            print(f"repo init --hub-create failed: {e}", file=sys.stderr)
            return 1
        hf_meta = {"repo_id": rid, "private": bool(getattr(args, "hub_private", True))}
        hrp = repo / ".tonic" / "hf-repo.json"
        hrp.parent.mkdir(parents=True, exist_ok=True)
        hrp.write_text(json.dumps(hf_meta, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        rname = (getattr(args, "hub_git_remote_name", "") or "").strip()
        if rname:
            url = f"https://huggingface.co/{rid}.git"
            subprocess.run(
                ["git", "-C", str(repo), "remote", "get-url", rname],
                capture_output=True,
                text=True,
                check=False,
            )
            cp = subprocess.run(
                ["git", "-C", str(repo), "remote", "add", rname, url],
                capture_output=True,
                text=True,
                check=False,
            )
            if cp.returncode != 0:
                subprocess.run(
                    ["git", "-C", str(repo), "remote", "set-url", rname, url],
                    check=False,
                )

    rest = list(getattr(args, "repo_rest", []) or [])
    if getattr(args, "do_fetch", False):
        refs = refs_to_fetch_from_profile(merged) + _collect_fetch_refs(rest)
        uniq = sorted(set(refs))
        rc = cmd_git_fetch(str(repo), merged["remote"], refs=uniq or None)
        if rc != 0:
            return rc

    print(json.dumps({"ok": True, "profile_path": str(repo_profile_path(str(repo)))}))
    return 0


def cmd_repo_fetch(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    prof = read_repo_profile(repo) or default_repo_profile()
    remote = (getattr(args, "remote", None) or "").strip() or prof["remote"]
    rest = list(getattr(args, "repo_rest", []) or [])
    refs = refs_to_fetch_from_profile(prof) + _collect_fetch_refs(rest)
    uniq = sorted(set(refs))
    return cmd_git_fetch(str(repo), remote, refs=uniq or None)


def _merge_compare_args(repo: Path, prof, args: argparse.Namespace) -> dict:
    """Overlay argparse compare args on repo profile (profile fills missing)."""
    p = prof or default_repo_profile()
    remote = getattr(args, "remote", None)
    if not (remote and str(remote).strip()):
        remote = p.get("remote", "origin")
    left_ref = getattr(args, "left_ref", None) or p.get("left_ref") or None
    right_ref = getattr(args, "right_ref", None) or p.get("right_ref") or None
    merge_branch = getattr(args, "merge_branch", None)
    base_branch = getattr(args, "base_branch", None) or "main"
    return {
        "remote": str(remote).strip(),
        "base_branch": base_branch,
        "merge_branch": merge_branch,
        "left_ref": left_ref if left_ref else None,
        "right_ref": right_ref if right_ref else None,
        "dry_run": bool(getattr(args, "dry_run", False)),
        "write": bool(getattr(args, "write", False)),
        "into_branch": getattr(args, "into_branch", None),
        "report_path": getattr(args, "report", None),
        "path_filters": list(getattr(args, "paths", []) or []),
        "swap_stages": bool(getattr(args, "swap_stages", False)),
        "backup": bool(getattr(args, "backup", False)),
        "atomic": not bool(getattr(args, "no_atomic", False)),
        "blame": bool(getattr(args, "blame", False)),
        "blame_max_commits": int(getattr(args, "blame_max_commits", 3)),
        "weave_merge": bool(getattr(args, "weave_merge", False)),
        "hub_prefetch": bool(getattr(args, "hub_prefetch", False)),
        "hub_repo_id": (getattr(args, "hub_repo_id", None) or p.get("hub_repo_id") or "").strip(),
    }


def cmd_repo_compare(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    prof = read_repo_profile(repo)
    kw = _merge_compare_args(repo, prof, args)
    rc = cmd_git_compare(str(repo), **kw)
    if rc != 0:
        return rc
    rp = kw.get("report_path")
    if rp and prof:
        p = Path(rp)
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            data["tonic_repo_profile"] = dict(prof)
            p.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        except Exception:
            pass
    return 0


def cmd_repo_compare_three(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    prof = read_repo_profile(repo)
    kw = _merge_compare_args(repo, prof, args)
    base_ref = getattr(args, "base_ref", None) or (prof.get("canonical_ref") if prof else None) or None
    hyd = list(getattr(args, "hydrate_after", []) or [])
    if hyd and hyd[0] == "--":
        hyd = hyd[1:]
    c3_kw = {
        "remote": kw["remote"],
        "base_branch": kw["base_branch"],
        "merge_branch": kw["merge_branch"],
        "left_ref": kw["left_ref"],
        "right_ref": kw["right_ref"],
        "base_ref": base_ref if base_ref and str(base_ref).strip() else None,
        "dry_run": kw["dry_run"],
        "write": kw["write"],
        "into_branch": kw["into_branch"],
        "report_path": kw["report_path"],
        "path_filters": kw["path_filters"],
        "swap_stages": kw["swap_stages"],
        "backup": kw["backup"],
        "atomic": kw["atomic"],
        "blame": kw["blame"],
        "blame_max_commits": kw["blame_max_commits"],
        "hub_prefetch": kw["hub_prefetch"],
        "hub_repo_id": kw["hub_repo_id"],
        "write_weave": bool(getattr(args, "write_weave", False)),
        "weave_writeback_mode": getattr(args, "weave_writeback_mode", "text") or "text",
        "weave_driver_strict": not bool(getattr(args, "weave_driver_non_strict", False)),
        "hydrate_after": hyd or None,
    }
    return cmd_git_compare_three(str(repo), **c3_kw)


def cmd_repo_hydrate(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    prof = read_repo_profile(repo)
    rest = list(getattr(args, "repo_rest", []) or [])
    prefix: list[str] = []
    if "--repo" not in rest and "-R" not in rest:
        prefix.extend(["--repo", str(repo)])
    if prof:
        od = (prof.get("hydrate_out_dir") or "").strip()
        if od and "--out-dir" not in rest:
            out = Path(od)
            prefix.extend(["--out-dir", str(out if out.is_absolute() else (repo / od))])
        ip = (prof.get("intent_profile") or "").strip()
        if ip and "--intent-profile" not in rest:
            ipp = Path(ip)
            prefix.extend(["--intent-profile", str(ipp if ipp.is_absolute() else (repo / ip))])
        pair = (prof.get("intent_pair") or "").strip()
        if pair and "--intent-pair" not in rest:
            prefix.extend(["--intent-pair", pair])
    return cmd_hydrate(prefix + rest)


def cmd_repo_resolve(args: argparse.Namespace) -> int:
    spec = (getattr(args, "resolve_spec", "") or "").strip()
    res = resolve_remote_spec(spec)
    if res is None:
        print(json.dumps({"ok": False, "spec": spec, "error": "unrecognized_spec"}))
        return 1
    if res.kind == "path":
        print(json.dumps({"ok": True, "kind": "path", "path": res.path}))
        return 0
    if res.kind == "github":
        print(json.dumps({"ok": True, "kind": "github", "url": res.url}))
        return 0
    print(json.dumps({"ok": True, "kind": "hub", "repo_id": res.repo_id}))
    return 0


def cmd_repo(args: argparse.Namespace) -> int:
    sub = args.repo_cmd
    if sub == "init":
        return cmd_repo_init(args)
    if sub == "fetch":
        return cmd_repo_fetch(args)
    if sub == "compare":
        return cmd_repo_compare(args)
    if sub == "compare-three":
        return cmd_repo_compare_three(args)
    if sub == "hydrate":
        return cmd_repo_hydrate(args)
    if sub == "resolve":
        return cmd_repo_resolve(args)
    return 1
