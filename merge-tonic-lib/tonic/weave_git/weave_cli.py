"""`merge-tonic weave` / `mergetonic weave` subcommands."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tonic.core.state import deserialize_state
from tonic.core.weave_introspect import (
    WeaveIntrospectError,
    inspect_rows_json,
    split_weave_index_after_visible,
)
from tonic.core.weave_slice import (
    WeaveExtractError,
    WeaveSpliceError,
    extract_weave_rows,
    splice_weave_rows,
)

from .hooks import install_hooks
from .lfs import find_lfs_pointers_under
from .manifest import load_manifest_path, serialize_manifest_json
from .replay_publish import replay_and_publish_ctrd_from_args
from .verify import DEFAULT_WEAVE_ROOT, verify_manifest, verify_staged, weave_blob_path


def cmd_weave_verify(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    manifest = Path(args.manifest) if args.manifest else repo / DEFAULT_WEAVE_ROOT / "manifest.json"
    if not manifest.is_file():
        print(f"weave verify: missing manifest {manifest}", file=sys.stderr)
        return 1
    wr = Path(args.weave_root).resolve() if getattr(args, "weave_root", "").strip() else None
    if args.staged:
        vr = verify_staged(repo, manifest, weave_root=wr, strict=args.strict)
    else:
        m = load_manifest_path(manifest)
        vr = verify_manifest(repo, m, weave_root=wr, strict=args.strict)
    if getattr(args, "check_lfs", False) or args.strict:
        objs = repo / ".tonic" / "objects"
        pointers = find_lfs_pointers_under(objs)
        if pointers and (args.strict or getattr(args, "check_lfs", False)):
            for p in pointers:
                vr.errors.append(
                    {"code": "lfs_pointer", "message": f"LFS pointer not smudged: {p}", "path": str(p)}
                )
                vr.checks.append(
                    {"id": f"lfs:{p}", "ok": False, "message": "pointer present", "path": str(p)}
                )
            vr.ok = False
    if args.json:
        print(json.dumps(vr.report_dict(str(repo)), indent=2))
    else:
        for c in vr.checks:
            ok = c.get("ok")
            cid = c.get("id", "")
            print(f"{'ok' if ok else 'FAIL'} {cid} {c.get('message', '')}")
        for e in vr.errors:
            print(f"error {e.get('code')}: {e.get('message')}", file=sys.stderr)
    return 0 if vr.ok else 1


def cmd_weave_install_hooks(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    ok, msgs = install_hooks(repo, mergetonic_cmd=args.mergetonic_cmd)
    for m in msgs:
        print(m)
    if not ok:
        print("weave install-hooks: failed", file=sys.stderr)
        return 1
    return 0


def cmd_weave_replay(args: argparse.Namespace) -> int:
    return replay_and_publish_ctrd_from_args(args, prefix="weave replay", dry_run=False)


def cmd_weave_init(args: argparse.Namespace) -> int:
    repo = Path(args.repo).resolve()
    root = repo / DEFAULT_WEAVE_ROOT
    (root / "blobs").mkdir(parents=True, exist_ok=True)
    man = {
        "schema": "tonic-git-manifest",
        "version": "1",
        "commit": "0000000000000000000000000000000000000000",
        "paths": {},
    }
    (root / "manifest.json").write_text(serialize_manifest_json(man), encoding="utf-8")
    print(f"initialized {root / 'manifest.json'}")
    return 0


def cmd_weave_doctor(args: argparse.Namespace) -> int:
    print("weave doctor: OK (library tier — install mergetonic-hf-weave for Hub / hf weave)")
    return 0


def _hf_weave_forward(sub: str, rest: list[str]) -> int:
    try:
        from mergetonic_hf_weave.cli import main as hf_weave_main
    except ImportError:
        print(
            f"weave {sub}: install mergetonic-hf-weave (`pip install mergetonic-hf-weave`) or run `hf weave {sub}`.",
            file=sys.stderr,
        )
        return 1
    if rest and rest[0] == "--":
        rest = rest[1:]
    return int(hf_weave_main([sub, *rest]))


def cmd_weave_push(args: argparse.Namespace) -> int:
    """Delegate to ``mergetonic_hf_weave`` push (same flags as ``hf weave push``)."""
    rest = list(getattr(args, "push_rest", None) or [])
    return _hf_weave_forward("push", rest)


def cmd_weave_pull(args: argparse.Namespace) -> int:
    """Delegate to ``mergetonic_hf_weave`` pull (same flags as ``hf weave pull``)."""
    rest = list(getattr(args, "pull_rest", None) or [])
    return _hf_weave_forward("pull", rest)


def cmd_weave_sync(args: argparse.Namespace) -> int:
    """Delegate to ``mergetonic_hf_weave.cli`` sync (same behavior as ``hf weave sync``)."""
    rest = list(getattr(args, "sync_rest", None) or [])
    return _hf_weave_forward("sync", rest)


def _parse_weave_range(spec: str) -> tuple[int, int]:
    if ":" not in spec:
        raise ValueError("--range must be START:END (half-open weave row indices)")
    a, b = spec.split(":", 1)
    return int(a.strip()), int(b.strip())


def _load_weave_blob_text(args: argparse.Namespace) -> str:
    wf = (getattr(args, "weave_file", None) or "").strip()
    if wf:
        p = Path(wf).resolve()
        if not p.is_file():
            raise FileNotFoundError(str(p))
        return p.read_text(encoding="utf-8")
    repo = Path(args.repo).resolve()
    manifest = (
        Path(args.manifest).resolve()
        if (getattr(args, "manifest", None) or "").strip()
        else repo / DEFAULT_WEAVE_ROOT / "manifest.json"
    )
    if not manifest.is_file():
        raise FileNotFoundError(str(manifest))
    m = load_manifest_path(manifest)
    path = (getattr(args, "path", None) or "").strip()
    if not path or path not in m.get("paths", {}):
        raise ValueError("need --weave-file or manifest --path for an existing manifest entry")
    ent = m["paths"][path]
    sha = ent.get("weave_serialized_sha")
    if not isinstance(sha, str) or not sha:
        raise ValueError("manifest row missing weave_serialized_sha")
    wr = (
        Path(args.weave_root).resolve()
        if (getattr(args, "weave_root", None) or "").strip()
        else repo / DEFAULT_WEAVE_ROOT
    )
    blob = weave_blob_path(wr, sha)
    if not blob.is_file():
        raise FileNotFoundError(str(blob))
    return blob.read_text(encoding="utf-8")


def cmd_weave_inspect(args: argparse.Namespace) -> int:
    try:
        raw = _load_weave_blob_text(args)
        payload = inspect_rows_json(deserialize_state(raw))
    except (OSError, ValueError, WeaveIntrospectError) as e:
        print(f"weave inspect: {e}", file=sys.stderr)
        return 1
    print(json.dumps(payload, indent=2))
    return 0


def cmd_weave_extract(args: argparse.Namespace) -> int:
    try:
        raw = _load_weave_blob_text(args)
        wa, wb = _parse_weave_range(args.range)
        out = extract_weave_rows(raw, wa, wb)
    except (OSError, ValueError, WeaveExtractError) as e:
        print(f"weave extract: {e}", file=sys.stderr)
        return 1
    outp = (getattr(args, "out", None) or "").strip()
    if outp:
        Path(outp).write_text(out, encoding="utf-8")
    else:
        sys.stdout.write(out)
    return 0


def cmd_weave_splice(args: argparse.Namespace) -> int:
    try:
        tp = Path(args.target_weave).resolve()
        fp = Path(args.fragment_weave).resolve()
        target = tp.read_text(encoding="utf-8")
        frag = fp.read_text(encoding="utf-8")
        if args.split is not None:
            split = int(args.split)
        elif args.after_visible is not None:
            split = split_weave_index_after_visible(deserialize_state(target), int(args.after_visible))
        else:
            print("weave splice: provide --split or --after-visible", file=sys.stderr)
            return 1
        out = splice_weave_rows(target, frag, split)
    except (OSError, ValueError, WeaveIntrospectError, WeaveSpliceError, WeaveExtractError) as e:
        print(f"weave splice: {e}", file=sys.stderr)
        return 1
    outp = (getattr(args, "out", None) or "").strip()
    if not outp:
        print("weave splice: need --out PATH", file=sys.stderr)
        return 1
    Path(outp).write_text(out, encoding="utf-8")
    return 0


def build_weave_parser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser("weave", help="Tonic weave Git integration (manifest, verify, hooks)")
    wsub = p.add_subparsers(dest="weave_cmd", required=True)

    v = wsub.add_parser("verify", help="Verify text ↔ manifest ↔ local weave blobs")
    v.add_argument("--repo", "-R", default=".")
    v.add_argument("--manifest", "-m", default="", help="Path to manifest.json")
    v.add_argument("--weave-root", default="", help="Override .tonic/weave root")
    v.add_argument("--staged", "-s", action="store_true", help="Only paths staged in git index")
    v.add_argument("--strict", action="store_true", help="Fail on degraded rows / LFS pointers")
    v.add_argument("--check-lfs", action="store_true", help="Treat .tonic/objects LFS pointers as errors in strict")
    v.add_argument("--json", "-j", action="store_true")
    v.set_defaults(func=cmd_weave_verify)

    h = wsub.add_parser("install-hooks", help="Install pre-commit / pre-push hooks")
    h.add_argument("--repo", "-R", default=".")
    h.add_argument("--mergetonic-cmd", default="merge-tonic", help="CLI name used inside hook scripts")
    h.set_defaults(func=cmd_weave_install_hooks)

    r = wsub.add_parser("replay", help="Replay steps and check weave_serialized_sha")
    r.add_argument("--repo", "-R", default=".")
    r.add_argument("--manifest", "-m", default="")
    r.add_argument("--path", "-p", required=True, help="Logical path key in manifest")
    r.add_argument("--steps-json", default="", help="JSON array of {commit, lines} (optional if Hub CTRD)")
    r.add_argument(
        "--trace-key",
        default="",
        help="CTRD id (64 hex) to fetch from Hub .tonic/hub/traces/{key}.json",
    )
    r.add_argument(
        "--from-hub",
        action="store_true",
        help="Use manifest.paths[path].replay_trace_key and fetch CTRD from Hub",
    )
    r.add_argument(
        "--repo-id",
        default="",
        dest="repo_id",
        help="Hugging Face Hub model id (overrides .tonic/hf-repo.json and profile)",
    )
    r.add_argument("--checkpoint-every", type=int, default=0)
    r.add_argument(
        "--persist-checkpoints",
        default="",
        help="Weave root dir: write full weave blobs at each checkpoint (requires --checkpoint-every > 0)",
    )
    r.add_argument("--json", "-j", action="store_true", dest="json_out")
    r.add_argument(
        "--publish-ctrd",
        action="store_true",
        help="After successful hash match, build CTRD, upload to Hub, set manifest replay_trace_key",
    )
    r.set_defaults(func=cmd_weave_replay)

    i = wsub.add_parser("init", help="Create empty .tonic/weave layout")
    i.add_argument("--repo", "-R", default=".")
    i.set_defaults(func=cmd_weave_init)

    d = wsub.add_parser("doctor", help="Sanity checks and install hints")
    d.add_argument("--repo", "-R", default=".")
    d.set_defaults(func=cmd_weave_doctor)

    sy = wsub.add_parser(
        "sync",
        help="Hub sync (forwards to mergetonic-hf-weave sync — same flags as hf weave sync)",
    )
    sy.add_argument(
        "sync_rest",
        nargs=argparse.REMAINDER,
        default=[],
        help="Forwarded to hf-weave sync, e.g. --repo . --update-index --publish-ctrd -p PATH",
    )
    sy.set_defaults(func=cmd_weave_sync)

    ins = wsub.add_parser("inspect", help="JSON: weave rows, visible↔weave maps (see docs/weave-line-indices-and-lca.md)")
    ins.add_argument("--repo", "-R", default=".")
    ins.add_argument("--manifest", "-m", default="", help="Manifest path (default .tonic/weave/manifest.json under repo)")
    ins.add_argument("--path", "-p", default="", help="Logical path in manifest (omit if --weave-file)")
    ins.add_argument("--weave-root", default="", help="Override .tonic/weave root")
    ins.add_argument("--weave-file", default="", help="Read serialized weave from this file instead of manifest blob")
    ins.set_defaults(func=cmd_weave_inspect)

    ex = wsub.add_parser("extract", help="Extract half-open weave row range [START:END), renormalized depths")
    ex.add_argument("--repo", "-R", default=".")
    ex.add_argument("--manifest", "-m", default="")
    ex.add_argument("--path", "-p", default="")
    ex.add_argument("--weave-root", default="")
    ex.add_argument("--weave-file", default="")
    ex.add_argument("--range", required=True, help="START:END half-open weave indices")
    ex.add_argument("--out", "-o", default="", help="Write weave (default stdout)")
    ex.set_defaults(func=cmd_weave_extract)

    sp = wsub.add_parser("splice", help="Insert fragment weave into target (file paths); --split or --after-visible")
    sp.add_argument("--target-weave", required=True, help="Serialized target weave file")
    sp.add_argument("--fragment-weave", required=True, help="Serialized fragment weave file")
    sp.add_argument(
        "--split",
        type=int,
        default=None,
        help="Insert fragment before this 0-based weave row index (0=start; omit with --after-visible)",
    )
    sp.add_argument(
        "--after-visible",
        type=int,
        default=None,
        dest="after_visible",
        help="Insert after this many visible lines (0=start; use visible count to append)",
    )
    sp.add_argument("--out", "-o", required=True, help="Output weave path")
    sp.set_defaults(func=cmd_weave_splice)

    pu = wsub.add_parser(
        "push",
        help="Hub blob push (forwards to mergetonic-hf-weave push — same flags as hf weave push)",
    )
    pu.add_argument("--repo", "-R", default=".")
    pu.add_argument(
        "push_rest",
        nargs=argparse.REMAINDER,
        default=[],
        help="Forwarded to hf-weave push, e.g. --update-index",
    )
    pu.set_defaults(func=cmd_weave_push)

    pl = wsub.add_parser(
        "pull",
        help="Hub blob pull (forwards to mergetonic-hf-weave pull — same flags as hf weave pull)",
    )
    pl.add_argument("--repo", "-R", default=".")
    pl.add_argument(
        "pull_rest",
        nargs=argparse.REMAINDER,
        default=[],
        help="Forwarded to hf-weave pull / prefetch flags",
    )
    pl.set_defaults(func=cmd_weave_pull)
