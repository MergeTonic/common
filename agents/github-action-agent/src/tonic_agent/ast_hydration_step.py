"""Optional ast-grep or full hydrate subprocess (parity with Node astHydrationStep)."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any


def _truthy(val: str | None) -> bool:
    if not val:
        return False
    return val.strip().lower() in {"1", "true", "yes", "on"}


def _hydration_orchestration_argv_from_env() -> list[str]:
    """Map INPUT_HYDRATION_* to hydrate argv tokens (before INPUT_AST_HYDRATION_EXTRA_ARGS)."""
    out: list[str] = []
    uq = (os.environ.get("INPUT_HYDRATION_USER_QUERY") or "").strip()
    if uq:
        out.extend(["--user-query", uq])
    fu = (os.environ.get("INPUT_HYDRATION_FOLLOW_UP") or "").strip()
    if fu:
        out.extend(["--follow-up", fu])
    pr = (os.environ.get("INPUT_HYDRATION_PRIOR_RUN") or "").strip()
    if pr:
        out.extend(["--prior-run", pr])
    return out


def _parse_intent_pair() -> tuple[str, str]:
    raw = (os.environ.get("INPUT_INTENT_PAIR") or "").strip()
    if not raw:
        return ("preserve intent from both sides", "preserve intent from both sides")
    parts = [p.strip() for p in raw.split(",")]
    left = parts[0] or "preserve intent from both sides"
    right = parts[1] if len(parts) > 1 and parts[1] else left
    return (left, right)


def run_ast_hydration_step(repo_root: str) -> dict[str, Any] | None:
    if not _truthy(os.environ.get("INPUT_ENABLE_AST_HYDRATION")):
        return None
    root = str(Path(repo_root).resolve())
    sub = (
        os.environ.get("INPUT_AST_HYDRATION_SUBCOMMAND")
        or os.environ.get("INPUT_AST_HYDRATION_MODE")
        or "ast-grep-hydrate"
    ).strip().lower()
    extra = (os.environ.get("INPUT_AST_HYDRATION_EXTRA_ARGS") or "").strip().split()

    if sub in ("hydrate", "full", "pipeline"):
        try:
            from tonic.hydration_pipeline import cmd_hydrate
        except ImportError:
            print("Tonic agent: ast hydration skipped (tonic.hydration_pipeline unavailable)", file=sys.stderr)
            return None
        out_dir = Path(root) / ".tonic" / "hydrate-out"
        out_dir.mkdir(parents=True, exist_ok=True)
        left, right = _parse_intent_pair()
        qm = (os.environ.get("INPUT_HYDRATION_QUESTION_MODE") or "off").strip().lower()
        if qm not in ("off", "on", "auto"):
            qm = "off"
        argv = [
            "--repo",
            root,
            "--out-dir",
            str(out_dir),
            "--left-intent",
            left,
            "--right-intent",
            right,
            "--question-mode",
            qm,
            *_hydration_orchestration_argv_from_env(),
            *extra,
        ]
        rc = cmd_hydrate(argv)
        run_path = out_dir / "hydration-run.json"
        run_obj: dict[str, Any] | None = None
        if run_path.is_file():
            try:
                run_obj = json.loads(run_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                run_obj = None
        intent_path = out_dir / "intent-hydration.json"
        if run_obj and isinstance(run_obj.get("intent_hydration_path"), str):
            ir = Path(run_obj["intent_hydration_path"])
            intent_path = ir if ir.is_absolute() else Path(root) / ir
        excerpt: str | None = None
        if intent_path.is_file():
            try:
                data = json.loads(intent_path.read_text(encoding="utf-8"))
                ex = data.get("prompt_excerpt")
                excerpt = str(ex) if isinstance(ex, str) else None
            except (OSError, json.JSONDecodeError):
                excerpt = None
        if rc not in (0, 13):
            print(f"Tonic agent: merge-tonic hydrate exited {rc}", file=sys.stderr)
            if _truthy(os.environ.get("INPUT_AST_HYDRATION_STRICT")):
                raise RuntimeError(f"merge-tonic hydrate failed with exit {rc}")
        return {
            "mode": "hydrate",
            "exit_code": rc,
            "hydration_run_path": str(run_path).replace("\\", "/"),
            "ast_evidence_path": run_obj.get("ast_evidence_path") if run_obj else None,
            "intent_hydration_path": str(intent_path).replace("\\", "/"),
            "retrieval_path": run_obj.get("retrieval_path") if run_obj else None,
            "code_walk_trace_path": run_obj.get("code_walk_trace_path") if run_obj else None,
            "prompt_excerpt": excerpt,
        }

    try:
        from tonic.ast_grep_hydrate import parse_ast_grep_hydrate_argv, run_ast_grep_hydrate
    except ImportError:
        print("Tonic agent: ast hydration skipped (tonic.ast_grep_hydrate unavailable)", file=sys.stderr)
        return None

    out = str(Path(root) / ".tonic" / "ast-hydration.json")
    run_out = str(Path(root) / ".tonic" / "hydration-run.json")
    argv = ["--repo", root, "--out", out, "--run-out", run_out, *extra]
    rc = run_ast_grep_hydrate(parse_ast_grep_hydrate_argv(argv))
    if rc not in (0, 13):
        print(f"Tonic agent: ast-grep-hydrate exited {rc}", file=sys.stderr)
        if _truthy(os.environ.get("INPUT_AST_HYDRATION_STRICT")):
            raise RuntimeError(f"ast-grep-hydrate failed with exit {rc}")
    return {
        "mode": "ast-grep-hydrate",
        "exit_code": rc,
        "hydration_run_path": run_out.replace("\\", "/"),
        "ast_evidence_path": out.replace("\\", "/"),
    }
