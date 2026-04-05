"""Ast-grep hydration: run sg scan, emit tonic-ast-hydration + tonic-hydration-run (parity with @mergetonic/core)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

EXIT_OK = 0
EXIT_AST_GREP_MISSING = 10
EXIT_INVALID_ARGS = 11
EXIT_SCAN_FAILED = 12
EXIT_PARTIAL = 13


@dataclass
class AstGrepHydrateOptions:
    repo_root: str
    out_path: str
    run_out_path: str
    ruleset: str = "default"
    config_path: str = ""
    rule_path: str = ""
    inline_rule: str = ""
    languages: str = "auto"
    include_globs: list[str] = field(default_factory=list)
    exclude_globs: list[str] = field(default_factory=list)
    changed_only: bool = False
    max_matches_per_file: int = 0
    max_matches_per_rule: int = 0
    ast_grep_bin: str = ""
    extra_args: list[str] = field(default_factory=list)


def _default_rule_path() -> Path:
    return Path(__file__).resolve().parent / "data" / "ast_grep_rules" / "typescript.yml"


def resolve_ast_grep_binary(opts: AstGrepHydrateOptions) -> str | None:
    flag = (opts.ast_grep_bin or "").strip()
    if flag:
        p = Path(flag)
        looks = (
            "/" in flag
            or "\\" in flag
            or flag.endswith(".js")
            or flag.endswith(".exe")
            or p.is_absolute()
        )
        if looks and not p.exists():
            return None
        if p.exists() or "/" in flag or "\\" in flag:
            return str(p)
        for cmd in (flag,):
            which = shutil_which(cmd)
            if which:
                return which
        return flag
    env = (os.environ.get("TONIC_AST_GREP_BIN") or "").strip()
    if env:
        return env
    for name in ("sg", "ast-grep"):
        w = shutil_which(name)
        if w:
            return w
    return None


def shutil_which(cmd: str) -> str | None:
    path = os.environ.get("PATH", "")
    ext = ".exe" if os.name == "nt" else ""
    for d in path.split(os.pathsep):
        for c in (cmd, cmd + ext):
            p = Path(d) / c
            if p.is_file():
                return str(p)
    return None


def _list_repo_files(repo: Path) -> list[str]:
    out: list[str] = []
    skip = {".git", "node_modules", ".tonic"}

    def walk(base: Path, rel: str) -> None:
        try:
            entries = list(base.iterdir())
        except OSError:
            return
        for e in sorted(entries, key=lambda x: x.name):
            if e.name in skip:
                continue
            r = f"{rel}/{e.name}".strip("/")
            if e.is_dir():
                walk(e, r)
            elif e.is_file():
                out.append(r.replace("\\", "/"))

    walk(repo, "")
    return sorted(out)


def _git_changed(repo: Path) -> list[str] | None:
    r = subprocess.run(
        ["git", "-C", str(repo), "diff", "--name-only", "HEAD"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if r.returncode != 0:
        return None
    return [x.strip().replace("\\", "/") for x in r.stdout.splitlines() if x.strip()]


def _build_scan_argv(opts: AstGrepHydrateOptions, scan_paths: list[str]) -> list[str]:
    args = ["scan", "--json"]
    if opts.config_path:
        args.extend(["--config", opts.config_path])
    elif opts.rule_path:
        args.extend(["--rule", opts.rule_path])
    elif opts.inline_rule:
        args.extend(["--inline-rules", opts.inline_rule])
    args.extend(opts.extra_args)
    if not scan_paths:
        args.append(".")
    else:
        args.extend(scan_paths)
    return args


def _parse_stdout(stdout: str) -> list[Any]:
    t = stdout.strip()
    if not t:
        return []
    try:
        j = json.loads(t)
        if isinstance(j, list):
            return j
        return [j]
    except json.JSONDecodeError:
        rows: list[Any] = []
        for line in stdout.splitlines():
            s = line.strip()
            if not s:
                continue
            try:
                rows.append(json.loads(s))
            except json.JSONDecodeError:
                continue
        return rows


def _norm_match(raw: dict[str, Any], repo_root: str) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    rid = raw.get("ruleId") or raw.get("rule_id") or raw.get("id") or "unknown"
    p = str(raw.get("path") or raw.get("file") or raw.get("filename") or "")
    if not p:
        return None
    rp = Path(repo_root).resolve()
    try:
        rel = str(Path(p).resolve().relative_to(rp)).replace("\\", "/")
    except ValueError:
        rel = p.replace("\\", "/")
    lang = str(raw.get("language") or raw.get("lang") or "unknown")
    msg = str(raw.get("message") or "")
    start = None
    end = None
    if isinstance(raw.get("range"), dict):
        rg = raw["range"]
        if isinstance(rg.get("start"), dict):
            ls = rg["start"]
            start = {"line": int(ls.get("line", 0)), "column": int(ls.get("column", 0))}
        if isinstance(rg.get("end"), dict):
            le = rg["end"]
            end = {"line": int(le.get("line", 0)), "column": int(le.get("column", 0))}
    return {
        "rule_id": str(rid),
        "severity": "warning",
        "language": lang,
        "path": rel,
        "start": start,
        "end": end,
        "message": msg,
        "meta": {},
    }


def run_ast_grep_hydrate(opts: AstGrepHydrateOptions) -> int:
    t0 = __import__("time").time() * 1000
    run_id = str(uuid.uuid4())
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []

    if opts.ruleset == "default" and not opts.config_path and not opts.rule_path and not opts.inline_rule:
        opts.rule_path = str(_default_rule_path())

    bin_path = resolve_ast_grep_binary(opts)
    if not bin_path:
        errors.append({"code": "ast_grep_missing", "message": "ast-grep (sg) not found"})
        _write_run(opts.run_out_path, run_id, "failed", EXIT_AST_GREP_MISSING, errors, warnings, opts, int(__import__("time").time() * 1000 - t0), None, None)
        return EXIT_AST_GREP_MISSING

    if not opts.config_path and not opts.rule_path and not opts.inline_rule:
        errors.append({"code": "invalid_args", "message": "Need --config, --rule, or --inline-rule"})
        _write_run(opts.run_out_path, run_id, "failed", EXIT_INVALID_ARGS, errors, warnings, opts, int(__import__("time").time() * 1000 - t0), None, None)
        return EXIT_INVALID_ARGS

    repo = Path(opts.repo_root).resolve()
    path_warnings: list[dict[str, str]] = []
    if opts.changed_only:
        ch = _git_changed(repo)
        if ch is None:
            path_warnings.append(
                {
                    "code": "git_diff_failed",
                    "message": "Could not list changed files; scanning full repo tree",
                }
            )
            candidates = _list_repo_files(repo)
        else:
            candidates = ch
    else:
        candidates = _list_repo_files(repo)

    scan_paths = [str(repo / c) for c in candidates]

    argv = _build_scan_argv(opts, scan_paths if scan_paths else [])
    timeout_ms = int(os.environ.get("TONIC_AST_GREP_TIMEOUT_MS", "300000") or "300000")
    spawn = [bin_path] + argv
    if bin_path.endswith(".js"):
        node = shutil_which("node")
        spawn = [(node or "node"), bin_path, *argv]

    try:
        proc = subprocess.run(
            spawn,
            cwd=str(repo),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=(timeout_ms / 1000.0) if timeout_ms > 0 else None,
        )
    except subprocess.TimeoutExpired:
        errors.append({"code": "scan_failed", "message": "ast-grep timeout"})
        _write_run(opts.run_out_path, run_id, "failed", EXIT_SCAN_FAILED, errors, warnings, opts, int(__import__("time").time() * 1000 - t0), None, None)
        return EXIT_SCAN_FAILED

    if proc.returncode is not None and proc.returncode > 2:
        errors.append(
            {
                "code": "scan_failed",
                "message": f"ast-grep exited {proc.returncode}",
                "detail": (proc.stderr or proc.stdout or "").strip(),
            }
        )
        _write_run(opts.run_out_path, run_id, "failed", EXIT_SCAN_FAILED, errors, warnings, opts, int(__import__("time").time() * 1000 - t0), None, None)
        return EXIT_SCAN_FAILED

    rows = _parse_stdout(proc.stdout or "")
    matches: list[dict[str, Any]] = []
    for row in rows:
        if isinstance(row, dict):
            m = _norm_match(row, str(repo))
            if m:
                matches.append(m)
    matches.sort(key=lambda m: (m["path"], m.get("start") or {}, m["rule_id"]))
    warnings.extend(path_warnings)
    truncated = False
    exit_code = EXIT_OK
    if truncated or warnings:
        exit_code = EXIT_PARTIAL

    langs = (
        ["auto"]
        if not opts.languages.strip() or opts.languages.strip().lower() == "auto"
        else [x.strip() for x in opts.languages.split(",") if x.strip()]
    )
    ast = {
        "schema": "tonic-ast-hydration",
        "version": "1",
        "tool": "ast-grep",
        "tool_version": "fixture-js" if bin_path.endswith(".js") else "unknown",
        "repo_root": str(repo).replace("\\", "/"),
        "scan_scope": "changed-only" if opts.changed_only else "full",
        "ruleset": opts.ruleset,
        "languages": langs,
        "summary": {
            "match_count": len(matches),
            "files_with_matches": len({m["path"] for m in matches}),
            "truncated": truncated,
        },
        "matches": matches,
    }
    _write_json(opts.out_path, ast)
    timing = int(__import__("time").time() * 1000 - t0)
    ast_rel = str(Path(opts.out_path).resolve()).replace("\\", "/")
    _write_run(opts.run_out_path, run_id, "partial" if exit_code == EXIT_PARTIAL else "ok", exit_code, errors, warnings, opts, timing, ast_rel, None)
    return exit_code


def _write_json(path_s: str, obj: Any) -> None:
    p = Path(path_s).resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


def _write_run(
    path_s: str,
    run_id: str,
    status: str,
    exit_code: int,
    errors: list[dict[str, str]],
    warnings: list[dict[str, str]],
    opts: AstGrepHydrateOptions,
    timing_ms: int,
    ast_path: str | None,
    pipeline: dict[str, Any] | None,
) -> None:
    body: dict[str, Any] = {
        "schema": "tonic-hydration-run",
        "version": "1",
        "run_id": run_id,
        "status": status,
        "exit_code": exit_code,
        "errors": errors,
        "warnings": warnings,
        "inputs": {
            "repo": opts.repo_root,
            "ruleset": opts.ruleset,
            "config": opts.config_path or None,
            "rule": opts.rule_path or None,
            "languages": opts.languages,
            "changed_only": opts.changed_only,
            "max_matches_per_file": opts.max_matches_per_file,
            "max_matches_per_rule": opts.max_matches_per_rule,
        },
        "timing_ms": timing_ms,
        "ast_evidence_path": ast_path,
        "retrieval_path": None,
        "tags_patch_path": None,
        "code_walk_trace_path": None,
        "intent_hydration_path": None,
        "intent_bootstrap_path": None,
        "question_refinement_path": None,
        "conflict_context_path": None,
        "repo_structure_path": None,
        "prior_run_path": None,
    }
    if pipeline:
        body["pipeline"] = pipeline
    _write_json(path_s, body)


def parse_ast_grep_hydrate_argv(argv: list[str]) -> AstGrepHydrateOptions:
    av = list(argv)
    extra: list[str] = []
    if "--" in av:
        ei = av.index("--")
        extra = av[ei + 1 :]
        av = av[:ei]

    def get_arg(names: list[str], default: str = "") -> str:
        for i, a in enumerate(av):
            if a in names and i + 1 < len(av) and not av[i + 1].startswith("-"):
                return av[i + 1]
        return default

    def has_flag(names: list[str]) -> bool:
        return any(x in av for x in names)

    def collect_multi(flag: str) -> list[str]:
        out: list[str] = []
        i = 0
        while i < len(av):
            if av[i] == flag and i + 1 < len(av) and not av[i + 1].startswith("-"):
                out.append(av[i + 1])
                i += 2
            else:
                i += 1
        return out

    repo = str(Path(get_arg(["--repo", "-R"], ".")).resolve())
    out_path = get_arg(["--out", "-o"], str(Path(repo) / ".tonic" / "ast-hydration.json"))
    run_out = get_arg(["--run-out"], str(Path(repo) / ".tonic" / "hydration-run.json"))
    ruleset = get_arg(["--ruleset"], "default")
    config_path = get_arg(["--config", "-c"], "")
    rule_path = get_arg(["--rule"], "")
    inline_rule = get_arg(["--inline-rule"], "")
    languages = get_arg(["--languages"], "auto")
    ast_grep_bin = get_arg(["--ast-grep-bin"], "")
    max_pf = int(get_arg(["--max-matches-per-file"], "0") or "0")
    max_pr = int(get_arg(["--max-matches-per-rule"], "0") or "0")

    if ruleset == "default" and not config_path and not rule_path and not inline_rule:
        rule_path = str(_default_rule_path())

    return AstGrepHydrateOptions(
        repo_root=repo,
        out_path=out_path,
        run_out_path=run_out,
        ruleset=ruleset,
        config_path=config_path,
        rule_path=rule_path,
        inline_rule=inline_rule,
        languages=languages,
        include_globs=collect_multi("--include"),
        exclude_globs=collect_multi("--exclude"),
        changed_only=has_flag(["--changed-only"]),
        max_matches_per_file=max_pf,
        max_matches_per_rule=max_pr,
        ast_grep_bin=ast_grep_bin,
        extra_args=extra,
    )


def cmd_ast_grep_hydrate(argv: list[str]) -> int:
    opts = parse_ast_grep_hydrate_argv(argv)
    return run_ast_grep_hydrate(opts)
