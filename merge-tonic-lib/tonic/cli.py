"""Command-line interface (parity with @mergetonic/core merge-tonic)."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from tonic.conflict_parser import parse_tonic_conflicts_with_diagnostics
from tonic.license_cli import LICENSE_GATE_MESSAGE, cmd_accept_license, license_accepted
from tonic.merge_utils import (
    annotated_to_conflict_file,
    apply_tonic_heuristic,
    artifact_dict,
    heuristic_resolved_lines,
    merge_snapshots,
    minimal_merge_report,
)
from tonic.repo_cli import cmd_repo
from tonic.weave_git.weave_cli import build_weave_parser


def _norm_lines(s: str) -> list[str]:
    lines = s.splitlines()
    if lines and lines[-1] == "":
        lines = lines[:-1]
    return lines


def _read_file(path: str) -> str:
    p = Path(path)
    return p.read_text(encoding="utf-8")


def _cmd_merge_branches(base_ref: str, target_branch: str, repo: str) -> int:
    from tonic.git_cli import _current_branch, cmd_git_materialize, cmd_git_merge

    current = _current_branch(repo)
    if current != target_branch:
        print(
            f'merge branch helper: HEAD is "{current}", expected "{target_branch}"',
            file=sys.stderr,
        )
        return 1
    rc = cmd_git_merge(repo, base_ref, no_commit=True)
    if rc != 0:
        return rc
    return cmd_git_materialize(repo, write=True)


def cmd_merge(args: argparse.Namespace) -> int:
    left_path = args.left or args.merge_left
    right_path = args.right or args.merge_right
    if left_path and right_path:
        left = _norm_lines(_read_file(left_path))
        right = _norm_lines(_read_file(right_path))
        _, annotated = merge_snapshots(
            left,
            right,
            left_commit_id=args.left_commit_id,
            right_commit_id=args.right_commit_id,
        )
        if args.json_state:
            from tonic import current_lines, initial_state, merge_states

            state1, state2 = initial_state(left), initial_state(right)
            merged_state, ann = merge_states(state1, state2)
            out = {
                "merged_state": merged_state,
                "current_lines": current_lines(merged_state),
                "annotated": ann,
            }
            print(json.dumps(out, indent=2))
            return 0
        if args.in_place and args.out:
            print("merge: use only one of --in-place or --out", file=sys.stderr)
            return 1
        text = "\n".join(annotated)
        suffix = "\n" if annotated else ""
        dest = args.out or (left_path if args.in_place else "")
        if dest:
            Path(dest).write_text(text + suffix, encoding="utf-8")
        else:
            print(text)
        return 0

    if args.base_ref and args.target_branch:
        repo = str(Path(args.repo).resolve())
        return _cmd_merge_branches(args.base_ref, args.target_branch, repo)

    print("merge: use either --left/--right file mode or positional <base-ref> <target-branch>", file=sys.stderr)
    return 1


def cmd_conflicts(args: argparse.Namespace) -> int:
    file_arg = args.file or args.conflict_file or "-"
    raw = sys.stdin.read() if file_arg == "-" else _read_file(file_arg)
    diag = parse_tonic_conflicts_with_diagnostics(raw)
    payload = {
        "blocks": [
            {
                "startLine": b["start_line"],
                "endLine": b["end_line"],
                "kind": b["kind"],
                "segments": b["segments"],
            }
            for b in diag["blocks"]
        ],
        "warnings": diag["warnings"],
    }
    print(json.dumps(payload, indent=2))
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    left_path = args.left or args.report_left
    right_path = args.right or args.report_right
    if not left_path or not right_path:
        print("report: need --left/--right or positional <left> <right>", file=sys.stderr)
        return 1
    left = _norm_lines(_read_file(left_path))
    right = _norm_lines(_read_file(right_path))
    merged, annotated = merge_snapshots(
        left,
        right,
        left_commit_id=args.left_commit_id,
        right_commit_id=args.right_commit_id,
    )
    path = args.path or Path(left_path).name
    art = artifact_dict(
        path,
        base_sha=args.base_sha,
        head_sha=args.head_sha,
        left_lines=left,
        right_lines=right,
        merged_lines=merged,
        annotated_lines=annotated,
        include_annotated=not args.no_annotated,
        include_blame=args.blame,
        left_commit_id=args.left_commit_id,
        right_commit_id=args.right_commit_id,
        blame_max_commits=args.blame_max_commits,
    )
    report = minimal_merge_report(
        run_id=args.run_id,
        pr_title=args.pr_title,
        base_sha=args.base_sha,
        head_sha=args.head_sha,
        base_ref=args.base_ref,
        head_ref=args.head_ref,
        artifacts=[art],
    )
    text = json.dumps(report, indent=2)
    if args.out:
        Path(args.out).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    file_arg = args.file or args.apply_file
    if not file_arg:
        print("apply: need --file <path> or positional <path>", file=sys.stderr)
        return 1
    path = Path(file_arg)
    lines = _norm_lines(path.read_text(encoding="utf-8"))
    clean = apply_tonic_heuristic(lines)
    logical = args.path or path.name
    cf = annotated_to_conflict_file(logical, lines)
    if args.sidecar:
        sc = {
            "path": logical,
            "source": "heuristic",
            "regions": [
                {
                    "start_line": r.start_line,
                    "end_line": r.end_line,
                    "conflict_kind": r.conflict_kind,
                    "resolved_lines": heuristic_resolved_lines(r),
                }
                for r in cf.conflicts
            ],
        }
        Path(args.sidecar).write_text(json.dumps(sc, indent=2) + "\n", encoding="utf-8")
    if args.report:
        rep = {
            "schema": "merge-tonic-apply-report",
            "path": logical,
            "region_count": len(cf.conflicts),
            "wrote": args.write,
            "clean_line_count": len(clean),
        }
        Path(args.report).write_text(json.dumps(rep, indent=2) + "\n", encoding="utf-8")
    out_text = "\n".join(clean) + ("\n" if clean else "")
    if args.write:
        path.write_text(out_text, encoding="utf-8")
    print(
        json.dumps(
            {
                "path": logical,
                "region_count": len(cf.conflicts),
                "clean_lines": clean,
                "wrote": args.write,
            }
        )
    )
    return 0


def cmd_git(args: argparse.Namespace) -> int:
    from tonic.git_cli import (
        cmd_git_compare,
        cmd_git_compare_three,
        cmd_git_fetch,
        cmd_git_hydrate_intents,
        cmd_git_materialize,
        cmd_git_merge,
        cmd_git_worktree,
    )

    repo = str(Path(args.repo).resolve())
    if args.git_cmd == "fetch":
        extra_refs = list(getattr(args, "fetch_branch", []) or []) + list(getattr(args, "fetch_ref", []) or [])
        return cmd_git_fetch(repo, args.remote, prune=args.prune, refs=extra_refs or None)
    if args.git_cmd == "compare":
        return cmd_git_compare(
            repo,
            remote=args.remote,
            base_branch=args.base_branch,
            merge_branch=args.merge_branch,
            left_ref=args.left_ref,
            right_ref=args.right_ref,
            dry_run=args.dry_run,
            write=args.write,
            into_branch=args.into_branch,
            report_path=args.report,
            path_filters=list(args.paths or []),
            swap_stages=args.swap_stages,
            backup=args.backup,
            atomic=not args.no_atomic,
            blame=args.blame,
            blame_max_commits=args.blame_max_commits,
            weave_merge=getattr(args, "weave_merge", False),
            hub_prefetch=getattr(args, "hub_prefetch", False),
            hub_repo_id=getattr(args, "hub_repo_id", "") or "",
        )
    if args.git_cmd == "compare-three":
        hyd = list(getattr(args, "hydrate_after", []) or [])
        if hyd and hyd[0] == "--":
            hyd = hyd[1:]
        return cmd_git_compare_three(
            repo,
            remote=args.remote,
            base_branch=args.base_branch,
            merge_branch=args.merge_branch,
            left_ref=args.left_ref,
            right_ref=args.right_ref,
            base_ref=getattr(args, "base_ref", None),
            dry_run=args.dry_run,
            write=args.write,
            into_branch=args.into_branch,
            report_path=args.report,
            path_filters=list(args.paths or []),
            swap_stages=args.swap_stages,
            backup=args.backup,
            atomic=not args.no_atomic,
            blame=args.blame,
            blame_max_commits=args.blame_max_commits,
            hub_prefetch=getattr(args, "hub_prefetch", False),
            hub_repo_id=getattr(args, "hub_repo_id", "") or "",
            write_weave=bool(getattr(args, "write_weave", False)),
            weave_writeback_mode=getattr(args, "weave_writeback_mode", "text") or "text",
            weave_driver_strict=not bool(getattr(args, "weave_driver_non_strict", False)),
            hydrate_after=hyd or None,
        )
    if args.git_cmd in ("materialize", "from-index"):
        return cmd_git_materialize(
            repo,
            dry_run=args.dry_run,
            write=args.write,
            strategy=args.strategy,
            path_filters=list(args.paths or []),
            swap_stages=args.swap_stages,
            backup=args.backup,
            atomic=not args.no_atomic,
            blame=args.blame,
        )
    if args.git_cmd == "merge":
        return cmd_git_merge(repo, args.merge_ref, no_commit=args.no_commit)
    if args.git_cmd == "hydrate-intents":
        rest = list(getattr(args, "hydrate_intents_rest", []) or [])
        return cmd_git_hydrate_intents(repo, rest)
    if args.git_cmd == "worktree":
        wt = args.wt_cmd
        return cmd_git_worktree(
            repo,
            str(wt),
            path=getattr(args, "wt_path", None),
            ref=getattr(args, "wt_ref", None),
        )
    return 1


def cmd_ast_grep_hydrate(args: argparse.Namespace) -> int:
    from tonic.ast_grep_hydrate import parse_ast_grep_hydrate_argv, run_ast_grep_hydrate

    rest = list(getattr(args, "agh_rest", []) or [])
    return run_ast_grep_hydrate(parse_ast_grep_hydrate_argv(rest))


def cmd_hydrate(args: argparse.Namespace) -> int:
    from tonic.hydration_pipeline import cmd_hydrate as run_h

    rest = list(getattr(args, "hydrate_rest", []) or [])
    return run_h(rest)


def cmd_github(args: argparse.Namespace) -> int:
    from tonic.github_cli import github_ref_create

    if args.gh_cmd == "ref" and args.ref_cmd == "create":
        token = os.environ.get("GITHUB_TOKEN", "")
        repo = args.gh_repo or os.environ.get("GITHUB_REPOSITORY", "")
        if not repo or not args.ref or not args.sha or not token:
            print(
                "Need --repo (or GITHUB_REPOSITORY), --ref, --sha, GITHUB_TOKEN",
                file=sys.stderr,
            )
            return 1
        code, msg = github_ref_create(repo=repo, ref=args.ref, sha=args.sha, token=token)
        if code != 0:
            print(msg, file=sys.stderr)
            return 1
        print(msg)
        return 0
    return 1


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="merge-tonic")
    sub = parser.add_subparsers(dest="command", required=True)

    p_merge = sub.add_parser(
        "merge",
        help="Merge files with --left/--right, or branch helper: merge <base-ref> <target-branch>",
    )
    p_merge.add_argument("base_ref", nargs="?", help="Base ref for branch helper mode")
    p_merge.add_argument("target_branch", nargs="?", help="Target branch to verify against current HEAD")
    p_merge.add_argument("merge_left", nargs="?", help="Left file (positional shorthand file mode)")
    p_merge.add_argument("merge_right", nargs="?", help="Right file (positional shorthand file mode)")
    p_merge.add_argument("--left", "-l", default="")
    p_merge.add_argument("--right", "-r", default="")
    p_merge.add_argument("--repo", "-R", default=".", help="Path to git repository for branch helper mode")
    p_merge.add_argument("--out", "-o", default="")
    p_merge.add_argument("--in-place", "-i", action="store_true", dest="in_place")
    p_merge.add_argument("--json-state", "-j", action="store_true")
    p_merge.add_argument("--left-commit-id", default="", dest="left_commit_id")
    p_merge.add_argument("--right-commit-id", default="", dest="right_commit_id")
    p_merge.set_defaults(func=cmd_merge)

    p_apply = sub.add_parser(
        "apply",
        help="Heuristic-resolve Tonic markers in a file (optional --write, --sidecar)",
    )
    p_apply.add_argument("apply_file", nargs="?", help="Positional shorthand for --file")
    p_apply.add_argument("--file", "-f", default="")
    p_apply.add_argument("--path", "-p", default="", help="Logical path in sidecar")
    p_apply.add_argument("--write", "-w", action="store_true")
    p_apply.add_argument("--sidecar", "-s", default="", help="Write heuristic regions JSON")
    p_apply.add_argument("--report", "-t", default="", help="Write merge-tonic-apply-report JSON")
    p_apply.set_defaults(func=cmd_apply)

    p_conf = sub.add_parser("conflicts", help="Parse Tonic markers in a file → JSON")
    p_conf.add_argument("conflict_file", nargs="?", help="Positional shorthand for --file")
    p_conf.add_argument("--file", "-f", default="", help="Path or - for stdin")
    p_conf.set_defaults(func=cmd_conflicts)

    p_rep = sub.add_parser("report", help="Emit merge-tonic-report JSON for two files")
    p_rep.add_argument("report_left", nargs="?", help="Left file positional shorthand")
    p_rep.add_argument("report_right", nargs="?", help="Right file positional shorthand")
    p_rep.add_argument("--left", "-l", default="")
    p_rep.add_argument("--right", "-r", default="")
    p_rep.add_argument("--path", "-p", default="", help="Logical path in report")
    p_rep.add_argument("--out", "-o", default="")
    p_rep.add_argument("--run-id", default="cli", dest="run_id")
    p_rep.add_argument("--pr-title", default="cli", dest="pr_title")
    p_rep.add_argument("--base-sha", default="local", dest="base_sha")
    p_rep.add_argument("--head-sha", default="local", dest="head_sha")
    p_rep.add_argument("--base-ref", default="", dest="base_ref")
    p_rep.add_argument("--head-ref", default="", dest="head_ref")
    p_rep.add_argument("--no-annotated", "-n", action="store_true", dest="no_annotated")
    p_rep.add_argument("--blame", action="store_true")
    p_rep.add_argument("--left-commit-id", default="", dest="left_commit_id")
    p_rep.add_argument("--right-commit-id", default="", dest="right_commit_id")
    p_rep.add_argument("--blame-max-commits", type=int, default=3, dest="blame_max_commits")
    p_rep.set_defaults(func=cmd_report)

    p_agh = sub.add_parser("ast-grep-hydrate", aliases=["agh"], help="Run ast-grep scan → tonic-ast-hydration JSON")
    p_agh.add_argument("agh_rest", nargs=argparse.REMAINDER, default=[])
    p_agh.set_defaults(func=cmd_ast_grep_hydrate)

    p_hyd = sub.add_parser("hydrate", aliases=["h"], help="Multi-phase hydration pipeline (intent → conflicts → ast → bundle)")
    p_hyd.add_argument("hydrate_rest", nargs=argparse.REMAINDER, default=[])
    p_hyd.set_defaults(func=cmd_hydrate)

    build_weave_parser(sub)

    p_repo = sub.add_parser("repo", help="Repo profile + composite fetch/compare/hydrate")
    rsub = p_repo.add_subparsers(dest="repo_cmd", required=True)

    r_init = rsub.add_parser("init", help="Ensure .tonic layout and write repo.json")
    r_init.add_argument("--repo", "-R", default=".")
    r_init.add_argument("--remote", default=None)
    r_init.add_argument("--canonical-ref", default=None, dest="canonical_ref")
    r_init.add_argument("--left-ref", default=None, dest="left_ref")
    r_init.add_argument("--right-ref", default=None, dest="right_ref")
    r_init.add_argument("--intent-pair", default=None, dest="intent_pair")
    r_init.add_argument("--intent-profile", default=None, dest="intent_profile")
    r_init.add_argument("--hydrate-out-dir", default=None, dest="hydrate_out_dir")
    r_init.add_argument("--hub-repo-id", default=None, dest="hub_repo_id")
    r_init.add_argument(
        "--hub-create",
        action="store_true",
        dest="hub_create",
        help="Create Hub model repo if missing (needs HF_TOKEN); writes .tonic/hf-repo.json",
    )
    r_init.add_argument("--hub-private", action="store_true", default=True, dest="hub_private")
    r_init.add_argument(
        "--hub-git-remote-name",
        default="",
        dest="hub_git_remote_name",
        help="If set, git remote add/set-url NAME https://huggingface.co/{hub_repo_id}.git",
    )
    r_init.add_argument("--git-remote-url", default=None, dest="git_remote_url")
    r_init.add_argument("--compare-mode", default=None, dest="compare_mode")
    r_init.add_argument("--fetch", action="store_true", dest="do_fetch")
    r_init.add_argument("repo_rest", nargs=argparse.REMAINDER, default=[])
    r_init.set_defaults(func=cmd_repo, repo_cmd="init")

    r_fetch = rsub.add_parser("fetch", help="git fetch using profile refs + optional --branch/--ref")
    r_fetch.add_argument("--repo", "-R", default=".")
    r_fetch.add_argument("--remote", default=None)
    r_fetch.add_argument("repo_rest", nargs=argparse.REMAINDER, default=[])
    r_fetch.set_defaults(func=cmd_repo, repo_cmd="fetch")

    def _add_repo_compare_flags(p: argparse.ArgumentParser) -> None:
        p.add_argument("--repo", "-R", default=".")
        p.add_argument("--remote", "-r", default=None)
        p.add_argument("--base-branch", "-b", default="main")
        p.add_argument("--merge-branch", "-m", default=None)
        p.add_argument("--left-ref", "-l", default=None)
        p.add_argument("--right-ref", "-t", default=None)
        p.add_argument("--dry-run", "-d", action="store_true")
        p.add_argument("--write", "-w", action="store_true")
        p.add_argument("--into-branch", "-i", default=None)
        p.add_argument("--report", "-o", default=None)
        p.add_argument("--paths", "-p", action="append", default=[], dest="paths")
        p.add_argument("--swap-stages", "-s", action="store_true", dest="swap_stages")
        p.add_argument("--backup", "-k", action="store_true")
        p.add_argument("--no-atomic", "-N", action="store_true", dest="no_atomic")
        p.add_argument("--blame", action="store_true")
        p.add_argument("--blame-max-commits", type=int, default=3, dest="blame_max_commits")
        p.add_argument("--weave-merge", action="store_true", dest="weave_merge")
        p.add_argument("--hub-prefetch", action="store_true", dest="hub_prefetch")
        p.add_argument("--hub-repo-id", default=None, dest="hub_repo_id")

    r_cmp = rsub.add_parser("compare", aliases=["c"], help="git compare with profile defaults")
    _add_repo_compare_flags(r_cmp)
    r_cmp.set_defaults(func=cmd_repo, repo_cmd="compare")

    r_c3 = rsub.add_parser("compare-three", aliases=["c3"], help="git compare-three with profile defaults")
    _add_repo_compare_flags(r_c3)
    r_c3.add_argument("--base-ref", default=None, dest="base_ref")
    r_c3.add_argument("--write-weave", action="store_true", dest="write_weave")
    r_c3.add_argument(
        "--weave-writeback-mode",
        choices=("text", "weave"),
        default="text",
        dest="weave_writeback_mode",
    )
    r_c3.add_argument("--weave-driver-non-strict", action="store_true", dest="weave_driver_non_strict")
    r_c3.add_argument("--hydrate-after", nargs=argparse.REMAINDER, default=[], dest="hydrate_after")
    r_c3.set_defaults(func=cmd_repo, repo_cmd="compare-three")

    r_hyd = rsub.add_parser("hydrate", aliases=["h"], help="hydrate with profile defaults")
    r_hyd.add_argument("--repo", "-R", default=".")
    r_hyd.add_argument("repo_rest", nargs=argparse.REMAINDER, default=[])
    r_hyd.set_defaults(func=cmd_repo, repo_cmd="hydrate")

    r_res = rsub.add_parser("resolve", help="Classify path | GitHub URL | HF repo id (JSON)")
    r_res.add_argument("--repo", "-R", default=".")
    r_res.add_argument("resolve_spec", nargs="?", default="")
    r_res.set_defaults(func=cmd_repo, repo_cmd="resolve")

    p_git = sub.add_parser(
        "git",
        help="Git repo helpers (fetch, compare, materialize/from-index, merge, worktree, hydrate-intents)",
    )
    p_git.add_argument("--repo", "-R", default=".", help="Path to git repository")
    gsub = p_git.add_subparsers(dest="git_cmd", required=True)

    g_fetch = gsub.add_parser("fetch", help="git fetch")
    g_fetch.add_argument("--remote", "-r", default="origin")
    g_fetch.add_argument("--prune", "-p", action="store_true")
    g_fetch.add_argument("--branch", "-b", action="append", default=[], dest="fetch_branch")
    g_fetch.add_argument("--ref", action="append", default=[], dest="fetch_ref")
    g_fetch.set_defaults(func=cmd_git)

    g_cmp = gsub.add_parser("compare", help="Tonic-merge diff paths between two refs")
    g_cmp.add_argument("--remote", "-r", default="origin")
    g_cmp.add_argument("--base-branch", "-b", default="main")
    g_cmp.add_argument("--merge-branch", "-m", default=None)
    g_cmp.add_argument("--left-ref", "-l", default=None)
    g_cmp.add_argument("--right-ref", "-t", default=None)
    g_cmp.add_argument("--dry-run", "-d", action="store_true")
    g_cmp.add_argument("--write", "-w", action="store_true")
    g_cmp.add_argument("--into-branch", "-i", default=None)
    g_cmp.add_argument("--report", "-o", default=None)
    g_cmp.add_argument("--paths", "-p", action="append", default=[], dest="paths")
    g_cmp.add_argument("--swap-stages", "-s", action="store_true", dest="swap_stages")
    g_cmp.add_argument("--backup", "-k", action="store_true")
    g_cmp.add_argument("--no-atomic", "-N", action="store_true", dest="no_atomic")
    g_cmp.add_argument("--blame", action="store_true")
    g_cmp.add_argument("--blame-max-commits", type=int, default=3, dest="blame_max_commits")
    g_cmp.add_argument("--weave-merge", action="store_true", dest="weave_merge")
    g_cmp.add_argument("--hub-prefetch", action="store_true", dest="hub_prefetch")
    g_cmp.add_argument("--hub-repo-id", default="", dest="hub_repo_id")
    g_cmp.set_defaults(func=cmd_git)

    g_c3 = gsub.add_parser("compare-three", aliases=["c3"], help="Merge-base three-way merge via git merge-file")
    g_c3.add_argument("--remote", "-r", default="origin")
    g_c3.add_argument("--base-branch", "-b", default="main")
    g_c3.add_argument("--merge-branch", "-m", default=None)
    g_c3.add_argument("--left-ref", "-l", default=None)
    g_c3.add_argument("--right-ref", "-t", default=None)
    g_c3.add_argument("--base-ref", default=None, dest="base_ref")
    g_c3.add_argument("--dry-run", "-d", action="store_true")
    g_c3.add_argument("--write", "-w", action="store_true")
    g_c3.add_argument("--into-branch", "-i", default=None)
    g_c3.add_argument("--report", "-o", default=None)
    g_c3.add_argument("--paths", "-p", action="append", default=[], dest="paths")
    g_c3.add_argument("--swap-stages", "-s", action="store_true", dest="swap_stages")
    g_c3.add_argument("--backup", "-k", action="store_true")
    g_c3.add_argument("--no-atomic", "-N", action="store_true", dest="no_atomic")
    g_c3.add_argument("--blame", action="store_true")
    g_c3.add_argument("--blame-max-commits", type=int, default=3, dest="blame_max_commits")
    g_c3.add_argument("--hub-prefetch", action="store_true", dest="hub_prefetch")
    g_c3.add_argument("--hub-repo-id", default="", dest="hub_repo_id")
    g_c3.add_argument(
        "--write-weave",
        action="store_true",
        dest="write_weave",
        help="Update .tonic/weave/manifest.json and blobs for compare-three paths (no git commit).",
    )
    g_c3.add_argument(
        "--weave-writeback-mode",
        choices=("text", "weave"),
        default="text",
        dest="weave_writeback_mode",
        help="text=Mode A (snapshot weave, degraded); weave=merge_states on blobs (strict unless --weave-driver-non-strict).",
    )
    g_c3.add_argument(
        "--weave-driver-non-strict",
        action="store_true",
        dest="weave_driver_non_strict",
        help="Allow degraded fallback when weave compatibility checks fail.",
    )
    g_c3.add_argument(
        "--hydrate-after",
        nargs=argparse.REMAINDER,
        default=[],
        dest="hydrate_after",
        help="After --write/--write-weave, run merge-tonic hydrate with remaining argv (must be last).",
    )
    g_c3.set_defaults(func=cmd_git)

    g_mat = gsub.add_parser("materialize", help="Unmerged index → Tonic markers")
    g_mat.add_argument("--dry-run", "-d", action="store_true")
    g_mat.add_argument("--write", "-w", action="store_true")
    g_mat.add_argument("--strategy", "-S", default="ours-theirs")
    g_mat.add_argument("--paths", "-p", action="append", default=[], dest="paths")
    g_mat.add_argument("--swap-stages", "-s", action="store_true", dest="swap_stages")
    g_mat.add_argument("--backup", "-k", action="store_true")
    g_mat.add_argument("--no-atomic", "-N", action="store_true", dest="no_atomic")
    g_mat.add_argument("--blame", action="store_true")
    g_mat.set_defaults(func=cmd_git)

    g_fi = gsub.add_parser("from-index", help="Alias for materialize (unmerged :2:/:3:)")
    g_fi.add_argument("--dry-run", "-d", action="store_true")
    g_fi.add_argument("--write", "-w", action="store_true")
    g_fi.add_argument("--strategy", "-S", default="ours-theirs")
    g_fi.add_argument("--paths", "-p", action="append", default=[], dest="paths")
    g_fi.add_argument("--swap-stages", "-s", action="store_true", dest="swap_stages")
    g_fi.add_argument("--backup", "-k", action="store_true")
    g_fi.add_argument("--no-atomic", "-N", action="store_true", dest="no_atomic")
    g_fi.add_argument("--blame", action="store_true")
    g_fi.set_defaults(func=cmd_git)

    g_merge = gsub.add_parser("merge", help="git merge --no-ff [--no-commit] <ref>")
    g_merge.add_argument("merge_ref_pos", nargs="?", help="Positional shorthand for --ref")
    g_merge.add_argument("--ref", "-R", default="", dest="merge_ref")
    g_merge.add_argument("--no-commit", "-n", action="store_true", dest="no_commit")
    g_merge.set_defaults(func=cmd_git)

    g_hi = gsub.add_parser("hydrate-intents", help="Interactive intent profile or ast-grep passthrough")
    g_hi.add_argument("hydrate_intents_rest", nargs=argparse.REMAINDER, default=[])
    g_hi.set_defaults(func=cmd_git)

    g_wt = gsub.add_parser("worktree", help="git worktree add | list | remove")
    wt_sub = g_wt.add_subparsers(dest="wt_cmd", required=True)
    wt_add = wt_sub.add_parser("add")
    wt_add.add_argument("wt_path_pos", nargs="?", help="Positional shorthand for --path")
    wt_add.add_argument("wt_ref_pos", nargs="?", help="Positional shorthand for --ref")
    wt_add.add_argument("--path", "-P", default="", dest="wt_path")
    wt_add.add_argument("--ref", "-R", default="", dest="wt_ref")
    wt_add.set_defaults(func=cmd_git)
    wt_list = wt_sub.add_parser("list")
    wt_list.set_defaults(func=cmd_git)
    wt_rm = wt_sub.add_parser("remove")
    wt_rm.add_argument("wt_path_pos", nargs="?", help="Positional shorthand for --path")
    wt_rm.add_argument("--path", "-P", default="", dest="wt_path")
    wt_rm.set_defaults(func=cmd_git)

    p_gh = sub.add_parser("github", help="GitHub REST (ref create)")
    gh_sub = p_gh.add_subparsers(dest="gh_cmd", required=True)
    gh_ref = gh_sub.add_parser("ref")
    ref_sub = gh_ref.add_subparsers(dest="ref_cmd", required=True)
    gh_create = ref_sub.add_parser("create")
    gh_create.add_argument("--repo", default="", dest="gh_repo")
    gh_create.add_argument("--ref", required=True)
    gh_create.add_argument("--sha", required=True)
    gh_create.set_defaults(func=cmd_github)
    return parser


def main(argv: list[str] | None = None) -> int:
    argv = list(argv if argv is not None else sys.argv[1:])
    if argv and argv[0] in {"merge-tonic", "tonic-merge", "mt"}:
        argv = argv[1:]

    if not license_accepted():
        if argv and argv[0] == "accept-license":
            return cmd_accept_license()
        if not argv or argv[0] in ("help", "-h", "--help"):
            _build_arg_parser().print_help()
            return 0
        if "-h" not in argv and "--help" not in argv:
            print(LICENSE_GATE_MESSAGE, file=sys.stderr)
            return 1

    parser = _build_arg_parser()
    if argv and argv[0] == "accept-license":
        return cmd_accept_license()
    if not argv:
        parser.print_help()
        return 0

    # Lightweight aliases for commands while avoiding accidental remaps in values.
    if argv:
        top_alias = {
            "m": "merge",
            "a": "apply",
            "c": "conflicts",
            "r": "report",
            "g": "git",
            "w": "weave",
        }
        argv[0] = top_alias.get(argv[0], argv[0])
        if argv[0] == "git" and len(argv) >= 2:
            git_alias = {
                "f": "fetch",
                "mat": "materialize",
                "fi": "from-index",
                "m": "merge",
                "wt": "worktree",
                "hi": "hydrate-intents",
                "c3": "compare-three",
            }
            argv[1] = git_alias.get(argv[1], argv[1])
        if argv[0] in ("ast-grep-hydrate", "agh"):
            from tonic.ast_grep_hydrate import parse_ast_grep_hydrate_argv, run_ast_grep_hydrate

            if len(argv) >= 2 and argv[1] in ("-h", "--help", "help"):
                print("Usage: merge-tonic ast-grep-hydrate [--repo DIR] [--out PATH] [--run-out PATH] ...")
                return 0
            return run_ast_grep_hydrate(parse_ast_grep_hydrate_argv(argv[1:]))
        if argv[0] in ("hydrate", "h"):
            from tonic.hydration_pipeline import cmd_hydrate

            if len(argv) >= 2 and argv[1] in ("-h", "--help", "help"):
                print("Usage: merge-tonic hydrate [--repo DIR] [--out-dir DIR] [--left-intent S] ... [-- -- ast flags]")
                return 0
            return cmd_hydrate(argv[1:])
        if argv[0] == "git" and len(argv) >= 2 and argv[1] in ("hydrate-intents", "hi"):
            from tonic.git_cli import cmd_git_hydrate_intents

            ga = argv[2:]
            repo = str(Path(".").resolve())
            rest: list[str] = []
            i = 0
            while i < len(ga):
                if ga[i] in ("--repo", "-R") and i + 1 < len(ga):
                    repo = str(Path(ga[i + 1]).resolve())
                    i += 2
                else:
                    rest.append(ga[i])
                    i += 1
            return cmd_git_hydrate_intents(repo, rest)
    args = parser.parse_args(argv)
    if getattr(args, "command", "") == "git" and getattr(args, "git_cmd", "") == "merge":
        if not args.merge_ref:
            args.merge_ref = getattr(args, "merge_ref_pos", "") or ""
    if getattr(args, "command", "") == "git" and getattr(args, "git_cmd", "") == "worktree":
        wt_cmd = getattr(args, "wt_cmd", "")
        if wt_cmd == "add":
            if not getattr(args, "wt_path", ""):
                args.wt_path = getattr(args, "wt_path_pos", "")
            if not getattr(args, "wt_ref", ""):
                args.wt_ref = getattr(args, "wt_ref_pos", "")
        elif wt_cmd == "remove":
            if not getattr(args, "wt_path", ""):
                args.wt_path = getattr(args, "wt_path_pos", "")
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
