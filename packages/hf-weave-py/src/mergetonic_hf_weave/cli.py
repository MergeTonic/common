from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from mergetonic_hf_weave.client import redact_token


def _read_hf_repo_meta(repo: Path) -> dict[str, object]:
    p = repo / ".tonic" / "hf-repo.json"
    if not p.is_file():
        return {}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return raw if isinstance(raw, dict) else {}


def _weave_blob_shas_from_manifest(repo: Path) -> list[str]:
    m = repo / ".tonic" / "weave" / "manifest.json"
    if not m.is_file():
        return []
    try:
        data = json.loads(m.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    paths = data.get("paths", {})
    if not isinstance(paths, dict):
        return []
    out: list[str] = []
    for e in paths.values():
        if isinstance(e, dict):
            w = e.get("weave_serialized_sha")
            if isinstance(w, str) and w:
                out.append(w)
    return out


def _resolve_hub_repo_id(repo_root: Path, args: argparse.Namespace) -> str:
    from tonic.hf_weave.hub_repo_resolve import resolve_hub_repo_id_for_weave

    return resolve_hub_repo_id_for_weave(repo_root, (getattr(args, "repo_id", None) or "").strip())


def _hub_push_blobs_and_maybe_index(
    repo_root: Path,
    rid: str,
    *,
    offline: bool,
    update_index: bool,
) -> int:
    from tonic.hf_weave.client import hub_push_local_blobs
    from tonic.hf_weave.hub_index import refresh_weave_hub_index

    blobs = repo_root / ".tonic" / "weave" / "blobs"
    n = hub_push_local_blobs(weave_blobs_dir=blobs, repo_id=rid or None, offline=offline)
    print(redact_token(f"hf weave push: uploaded {n} blob(s)"))
    if update_index:
        refresh_weave_hub_index(repo_root, rid, offline=offline)
    return 0


def _git_add_weave_paths(repo_root: Path) -> int:
    man = repo_root / ".tonic" / "weave" / "manifest.json"
    if man.is_file():
        r = subprocess.run(
            ["git", "-C", str(repo_root), "add", "--", ".tonic/weave/manifest.json"],
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            print(f"hf weave sync: git add manifest failed: {r.stderr}", file=sys.stderr)
            return 1
    blobs = repo_root / ".tonic" / "weave" / "blobs"
    if blobs.is_dir():
        r = subprocess.run(
            ["git", "-C", str(repo_root), "add", "--", ".tonic/weave/blobs"],
            capture_output=True,
            text=True,
        )
        if r.returncode != 0:
            print(f"hf weave sync: git add blobs failed: {r.stderr}", file=sys.stderr)
            return 1
    return 0


def _git_commit_staged(repo_root: Path, message: str) -> int:
    r = subprocess.run(["git", "-C", str(repo_root), "diff", "--cached", "--quiet"], capture_output=True)
    if r.returncode == 0:
        print("hf weave sync: git commit skipped (nothing staged)", file=sys.stderr)
        return 0
    c = subprocess.run(
        ["git", "-C", str(repo_root), "commit", "-m", message],
        capture_output=True,
        text=True,
    )
    if c.returncode != 0:
        print(f"hf weave sync: git commit failed: {c.stderr}", file=sys.stderr)
        return 1
    print(redact_token((c.stdout or "").strip() or "committed"))
    return 0


def _cmd_init(args: argparse.Namespace) -> int:
    if args.offline:
        print(redact_token("hf weave init: offline — skipped Hub create-repo"))
        return 0
    from tonic.hf_weave.client import hub_create_repo_if_needed

    repo_id = (args.repo_id or "").strip()
    if not repo_id:
        repo_id = (os.environ.get("TONIC_HF_WEAVE_REPO", "") or os.environ.get("HF_WEAVE_HUB_REPO", "")).strip()
    if not repo_id:
        print(
            redact_token(
                "hf weave init: set --repo-id or TONIC_HF_WEAVE_REPO (namespace/model-name); "
                "run `hf auth login` first."
            ),
            file=sys.stderr,
        )
        return 1
    hub_create_repo_if_needed(repo_id=repo_id, private=args.private)
    meta = {"repo_id": repo_id, "private": bool(args.private)}
    root = Path(args.repo).resolve() / ".tonic"
    root.mkdir(parents=True, exist_ok=True)
    (root / "hf-repo.json").write_text(json.dumps(meta, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    try:
        from tonic.repo_profile import default_repo_profile, merge_repo_profiles, read_repo_profile, write_repo_profile

        repo_root = Path(args.repo).resolve()
        cur = read_repo_profile(repo_root) or default_repo_profile()
        write_repo_profile(repo_root, merge_repo_profiles(cur, {"hub_repo_id": repo_id}))
    except Exception:
        pass
    print(redact_token(f"hf weave init: ok {repo_id}"))
    return 0


def _cmd_push(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo).resolve()
    rid = _resolve_hub_repo_id(repo_root, args)
    if not rid and not args.offline:
        print("hf weave push: missing repo id (.tonic/hf-repo.json or TONIC_HF_WEAVE_REPO)", file=sys.stderr)
        return 1
    return _hub_push_blobs_and_maybe_index(
        repo_root,
        rid,
        offline=args.offline,
        update_index=bool(getattr(args, "update_index", False)),
    )


def _cmd_pull_or_prefetch(args: argparse.Namespace, *, label: str) -> int:
    from tonic.hf_weave.client import hub_download_repo_path, hub_prefetch_keys
    from tonic.hf_weave.hub_index import WEAVE_INDEX_HUB_PATH, parse_hub_index

    repo_root = Path(args.repo).resolve()
    keys: list[str] = []
    if getattr(args, "from_index", False):
        rid = _resolve_hub_repo_id(repo_root, args)
        if not rid and not args.offline:
            print(f"hf weave {label}: missing repo id for --from-index", file=sys.stderr)
            return 1
        raw = hub_download_repo_path(repo_id=rid, path_in_repo=WEAVE_INDEX_HUB_PATH) if rid else None
        if not raw:
            print(f"hf weave {label}: could not download hub index", file=sys.stderr)
            return 1
        try:
            idx = parse_hub_index(raw.decode("utf-8"))
            objs = idx.get("objects") or {}
            if isinstance(objs, dict):
                keys = sorted(objs.keys())
        except Exception as e:
            print(f"hf weave {label}: bad index: {e}", file=sys.stderr)
            return 1
    else:
        keys = _weave_blob_shas_from_manifest(repo_root)
    if not keys:
        print(f"hf weave {label}: no keys to fetch (manifest or index empty)", file=sys.stderr)
        return 1
    dest = repo_root / ".tonic" / "weave" / "blobs"
    rid = _resolve_hub_repo_id(repo_root, args)
    if not rid and not args.offline:
        print("hf weave pull: missing repo id", file=sys.stderr)
        return 1
    n = hub_prefetch_keys(keys=keys, repo_id=rid or None, dest_dir=dest, offline=args.offline)
    print(redact_token(f"hf weave {label}: fetched {n} blob(s) into {dest}"))
    return 0


def _cmd_doctor(_args: argparse.Namespace) -> int:
    print(
        redact_token(
            "hf weave doctor: `hf weave sync` for blobs + optional CTRD + index; ensure `hf auth login`, "
            "TONIC_HF_WEAVE_REPO, git fetch +refs/notes/tonic +refs/tonic/*; run `hf weave prefetch` on fresh clones."
        )
    )
    return 0


def _cmd_verify(args: argparse.Namespace) -> int:
    from tonic.weave_git.weave_cli import cmd_weave_verify

    return cmd_weave_verify(args)


def _cmd_replay(args: argparse.Namespace) -> int:
    from tonic.weave_git.replay_publish import replay_and_publish_ctrd_from_args

    return replay_and_publish_ctrd_from_args(args, prefix="hf weave replay", dry_run=False)


def _cmd_sync(args: argparse.Namespace) -> int:
    from tonic.weave_git.replay_publish import replay_and_publish_ctrd_from_args

    repo_root = Path(args.repo).resolve()
    rid = _resolve_hub_repo_id(repo_root, args)
    dry = bool(getattr(args, "dry_run", False))
    offline = bool(args.offline)
    no_push = bool(getattr(args, "no_push_blobs", False))
    update_index = bool(getattr(args, "update_index", False))
    publish = bool(getattr(args, "publish_ctrd", False))

    if publish:
        rp = (getattr(args, "replay_path", None) or "").strip()
        if not rp:
            print("hf weave sync: --publish-ctrd requires --replay-path / -p", file=sys.stderr)
            return 1
        replay_ns = argparse.Namespace(
            repo=str(repo_root),
            manifest=(getattr(args, "manifest", None) or "") or "",
            path=rp,
            steps_json=(getattr(args, "steps_json", None) or "") or "",
            trace_key=(getattr(args, "trace_key", None) or "") or "",
            from_hub=bool(getattr(args, "from_hub", False)),
            repo_id=(getattr(args, "repo_id", None) or "") or "",
            checkpoint_every=int(getattr(args, "checkpoint_every", 0) or 0),
            persist_checkpoints=(getattr(args, "persist_checkpoints", None) or "") or "",
            json_out=bool(getattr(args, "json_out", False)),
            publish_ctrd=True,
        )
        code = replay_and_publish_ctrd_from_args(replay_ns, prefix="hf weave sync", dry_run=dry)
        if code != 0:
            return code
    elif dry:
        print("hf weave sync: dry-run — skip replay/publish (no --publish-ctrd)")

    if not no_push:
        if dry:
            print("hf weave sync: dry-run — would upload weave blobs to Hub")
        else:
            if not rid and not offline:
                print("hf weave sync: missing repo id for blob push (.tonic/hf-repo.json or TONIC_HF_WEAVE_REPO)", file=sys.stderr)
                return 1
            rc = _hub_push_blobs_and_maybe_index(repo_root, rid, offline=offline, update_index=False)
            if rc != 0:
                return rc
    elif dry:
        print("hf weave sync: dry-run — skipped blob push (--no-push-blobs)")

    if update_index:
        if dry:
            print("hf weave sync: dry-run — would refresh Hub weave index")
        else:
            if not rid and not offline:
                print("hf weave sync: missing repo id for --update-index", file=sys.stderr)
                return 1
            from tonic.hf_weave.hub_index import refresh_weave_hub_index

            refresh_weave_hub_index(repo_root, rid, offline=offline)

    if dry:
        pass
    else:
        if getattr(args, "git_stage", False):
            if _git_add_weave_paths(repo_root) != 0:
                return 1
        msg = (getattr(args, "git_commit_message", None) or "").strip()
        if msg:
            if _git_commit_staged(repo_root, msg) != 0:
                return 1

    return 0


def _cmd_hydrate_w(args: argparse.Namespace) -> int:
    import subprocess

    repo = Path(args.repo).resolve()
    rest = list(getattr(args, "hydrate_rest", []) or [])
    if rest and rest[0] == "--":
        rest = rest[1:]
    cmd = [sys.executable, "-m", "tonic.cli", "hydrate", "--repo", str(repo), *rest]
    return int(subprocess.call(cmd))


def _cmd_tonic_pr_create(args: argparse.Namespace) -> int:
    from tonic.hf_weave.community_pr import create_hub_pull_request

    rid = (args.repo_id or "").strip()
    if not rid:
        print("tonic pr create: need --repo-id", file=sys.stderr)
        return 1
    r = create_hub_pull_request(rid, title=args.title, body=args.body or "")
    print(json.dumps({"discussion_id": r.discussion_id, "url": r.url, "head_sha": r.head_sha}))
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(argv if argv is not None else sys.argv[1:])
    p = argparse.ArgumentParser(prog="hf-weave", description="Merge Tonic hf weave extension")
    sub = p.add_subparsers(dest="cmd", required=True)

    s_init = sub.add_parser("init", help="Create Hub model repo and .tonic/hf-repo.json")
    s_init.add_argument("--repo", "-R", default=".")
    s_init.add_argument("--repo-id", default="", help="namespace/name (else TONIC_HF_WEAVE_REPO)")
    s_init.add_argument("--private", action="store_true", default=True)
    s_init.add_argument("--offline", action="store_true", default=False)
    s_init.set_defaults(func=_cmd_init)

    def add_hub_flags(sp: argparse.ArgumentParser, *, with_from_index: bool = False) -> None:
        sp.add_argument("--repo", "-R", default=".")
        sp.add_argument("--repo-id", default="", help="Override Hub repo id")
        sp.add_argument("--offline", action="store_true", default=False)
        if with_from_index:
            sp.add_argument(
                "--from-index",
                action="store_true",
                dest="from_index",
                help="Fetch keys listed in Hub .tonic/hub/weave-index.v1.json",
            )

    s_push = sub.add_parser("push", help="Upload .tonic/weave/blobs/* to Hub (content-addressed)")
    add_hub_flags(s_push)
    s_push.add_argument(
        "--update-index",
        action="store_true",
        dest="update_index",
        help="Merge/upload .tonic/hub/weave-index.v1.json (LWW) after blob push",
    )
    s_push.set_defaults(func=_cmd_push)

    s_sync = sub.add_parser(
        "sync",
        help="Optional CTRD replay+publish, then push weave blobs, optional Hub index refresh",
    )
    add_hub_flags(s_sync)
    s_sync.add_argument(
        "--no-push-blobs",
        action="store_true",
        help="Skip uploading .tonic/weave/blobs to Hub",
    )
    s_sync.add_argument(
        "--update-index",
        action="store_true",
        dest="update_index",
        help="Merge/upload .tonic/hub/weave-index.v1.json after blob push",
    )
    s_sync.add_argument(
        "--dry-run",
        action="store_true",
        help="No Hub writes or manifest writes; prints planned steps (replay still runs for --publish-ctrd)",
    )
    s_sync.add_argument(
        "--publish-ctrd",
        action="store_true",
        help="After successful replay, publish CTRD and set replay_trace_key (requires --replay-path)",
    )
    s_sync.add_argument("--manifest", "-m", default="", help="Path to manifest.json")
    s_sync.add_argument(
        "--replay-path",
        "-p",
        default="",
        help="Logical manifest path key (required with --publish-ctrd)",
    )
    s_sync.add_argument("--steps-json", default="", help="Replay steps JSON (optional if Hub CTRD)")
    s_sync.add_argument("--trace-key", default="", help="CTRD id to fetch from Hub")
    s_sync.add_argument(
        "--from-hub",
        action="store_true",
        help="Use manifest.paths[replay-path].replay_trace_key for CTRD fetch",
    )
    s_sync.add_argument("--checkpoint-every", type=int, default=0)
    s_sync.add_argument("--persist-checkpoints", default="")
    s_sync.add_argument("--json", "-j", action="store_true", dest="json_out")
    s_sync.add_argument(
        "--git-stage",
        action="store_true",
        help="Run git add on .tonic/weave/manifest.json and .tonic/weave/blobs",
    )
    s_sync.add_argument(
        "--git-commit-message",
        default="",
        help="Create a git commit if the index has staged changes (use with --git-stage)",
    )
    s_sync.set_defaults(func=_cmd_sync)

    s_pull = sub.add_parser("pull", help="Download manifest weave blobs into .tonic/weave/blobs")
    add_hub_flags(s_pull, with_from_index=True)
    s_pull.set_defaults(func=lambda a: _cmd_pull_or_prefetch(a, label="pull"))

    s_pf = sub.add_parser("prefetch", help="Alias for pull")
    add_hub_flags(s_pf, with_from_index=True)
    s_pf.set_defaults(func=lambda a: _cmd_pull_or_prefetch(a, label="prefetch"))

    s_ver = sub.add_parser("verify", help="Delegate to merge-tonic weave verify")
    s_ver.add_argument("--repo", "-R", default=".")
    s_ver.add_argument("--manifest", "-m", default="")
    s_ver.add_argument("--weave-root", default="")
    s_ver.add_argument("--staged", "-s", action="store_true")
    s_ver.add_argument("--strict", action="store_true")
    s_ver.add_argument("--check-lfs", action="store_true")
    s_ver.add_argument("--json", "-j", action="store_true")
    s_ver.set_defaults(func=_cmd_verify)

    s_rep = sub.add_parser("replay", help="Replay weave steps; optional CTRD publish (same as merge-tonic weave replay)")
    s_rep.add_argument("--repo", "-R", default=".")
    s_rep.add_argument("--manifest", "-m", default="")
    s_rep.add_argument("--path", "-p", required=True, help="Logical path key in manifest")
    s_rep.add_argument(
        "--steps-json",
        default="",
        help="JSON array of {commit, lines} (optional if Hub CTRD)",
    )
    s_rep.add_argument(
        "--trace-key",
        default="",
        help="CTRD id (64 hex) to fetch from Hub .tonic/hub/traces/{key}.json",
    )
    s_rep.add_argument(
        "--from-hub",
        action="store_true",
        help="Use manifest.paths[path].replay_trace_key and fetch CTRD from Hub",
    )
    s_rep.add_argument(
        "--repo-id",
        default="",
        dest="repo_id",
        help="Hugging Face Hub model id (overrides .tonic/hf-repo.json and profile)",
    )
    s_rep.add_argument("--checkpoint-every", type=int, default=0)
    s_rep.add_argument(
        "--persist-checkpoints",
        default="",
        help="Weave root: write weave blobs at each checkpoint (requires --checkpoint-every > 0)",
    )
    s_rep.add_argument("--json", "-j", action="store_true", dest="json_out")
    s_rep.add_argument(
        "--publish-ctrd",
        action="store_true",
        help="After successful hash match, build CTRD, upload to Hub, set manifest replay_trace_key",
    )
    s_rep.set_defaults(func=_cmd_replay)

    s_hy = sub.add_parser("hydrate", help="Delegate to `python -m tonic.cli hydrate` (argv parity after --repo)")
    s_hy.add_argument("--repo", "-R", default=".")
    s_hy.add_argument("hydrate_rest", nargs=argparse.REMAINDER, default=[])
    s_hy.set_defaults(func=_cmd_hydrate_w)

    p_tonic = sub.add_parser("tonic", help="Tonic Hub utilities (e.g. pr create)")
    tonic_sub = p_tonic.add_subparsers(dest="tonic_cmd", required=True)
    p_pr = tonic_sub.add_parser("pr", help="Hub pull request as discussion")
    pr_sub = p_pr.add_subparsers(dest="pr_cmd", required=True)
    p_pr_c = pr_sub.add_parser("create", help="Open Hub PR discussion (needs HF_TOKEN)")
    p_pr_c.add_argument("--repo-id", required=True)
    p_pr_c.add_argument("--title", required=True)
    p_pr_c.add_argument("--body", default="")

    sub.add_parser("doctor", help="Environment hints").set_defaults(func=_cmd_doctor)

    args = p.parse_args(argv)
    if args.cmd == "tonic":
        if getattr(args, "tonic_cmd", "") == "pr" and getattr(args, "pr_cmd", "") == "create":
            return int(_cmd_tonic_pr_create(args))
        return 1
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
