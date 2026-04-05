"""Composite hydrate pipeline (Python parity with TS runHydrationPipeline)."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from tonic.ast_grep_hydrate import (
    EXIT_AST_GREP_MISSING,
    EXIT_INVALID_ARGS,
    EXIT_OK,
    EXIT_PARTIAL,
    EXIT_SCAN_FAILED,
    parse_ast_grep_hydrate_argv,
    run_ast_grep_hydrate,
)
from tonic.hydration.build_intent_hydration import build_intent_hydration, write_intent_hydration
from tonic.hydration.retrieval import (
    build_batch_code_walk_trace,
    build_empty_retrieval_artifact,
    run_retrieval_for_hydrate,
)
from tonic.hydration.retrieval_hybrid import apply_retrieval_hybrid_stage
from tonic.hydration.conflict_scan import scan_repo_conflict_markers, write_conflict_context
from tonic.hydration.hydration_config import resolve_hydration_config
from tonic.hydration.intent_bootstrap import resolve_intent_bootstrap, write_intent_bootstrap
from tonic.hydration.ast_refinement_excerpt import format_ast_matches_excerpt_json
from tonic.hydration.conflict_hunk_excerpt import (
    build_conflict_hunk_excerpts,
    conflict_hunk_excerpts_to_prompt_json,
    merge_branch_hints_from_regions,
)
from tonic.hydration.question_refinement import (
    run_post_retrieval_question_refinement,
    run_question_refinement,
    write_question_refinement,
)
from tonic.hydration.conflict_gate import evaluate_conflict_gate
from tonic.hydration.hydration_phase import (
    HYDRATE_PHASE_ALL,
    HYDRATE_PHASE_AST_GREP,
    HYDRATE_PHASE_CODE_WALK,
    HYDRATE_PHASE_CONFLICTS,
    HYDRATE_PHASE_INTENT_BOOTSTRAP,
    HYDRATE_PHASE_QUESTION_REFINEMENT,
    HYDRATE_PHASE_REPO_STRUCTURE,
    HYDRATE_PHASE_RETRIEVAL,
    parse_hydrate_phase,
)
from tonic.hydration.repo_structure import repo_structure_excerpt, summarize_repo_structure, write_repo_structure


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _write_json(p: Path, obj: Any) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")


def _fail_run(
    p_run: Path,
    *,
    run_id: str,
    exit_code: int,
    errors: list[dict[str, str]],
    warnings: list[dict[str, str]],
    inputs: dict[str, Any],
    timing_ms: int,
    stages: list[dict[str, Any]],
    source_config: dict[str, Any] | None = None,
) -> None:
    sc = source_config if source_config is not None else {}
    _write_json(
        p_run,
        {
            "schema": "tonic-hydration-run",
            "version": "1",
            "run_id": run_id,
            "status": "failed",
            "exit_code": exit_code,
            "errors": errors,
            "warnings": warnings,
            "inputs": inputs,
            "timing_ms": timing_ms,
            "ast_evidence_path": None,
            "retrieval_path": None,
            "tags_patch_path": None,
            "code_walk_trace_path": None,
            "intent_hydration_path": None,
            "intent_bootstrap_path": None,
            "question_refinement_path": None,
            "conflict_context_path": None,
            "repo_structure_path": None,
            "prior_run_path": None,
            "pipeline": {"stages": stages, "source_config": sc},
        },
    )


def _read_repo_head(repo: Path) -> str | None:
    try:
        o = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if o.returncode != 0:
            return None
        t = (o.stdout or "").strip()
        return t or None
    except OSError:
        return None


def _resolve_art(run_file: Path, rel: str | None) -> Path | None:
    if not rel or not str(rel).strip():
        return None
    s = str(rel).strip()
    p = Path(s)
    if p.is_absolute():
        return p
    return (run_file.parent / p).resolve()


def _hash_ruleset(repo: Path, ruleset: str) -> str | None:
    if not ruleset or ruleset == "default":
        return None
    p = Path(ruleset)
    if not p.is_absolute():
        p = (repo / ruleset).resolve()
    try:
        return hashlib.sha256(p.read_bytes()).hexdigest()
    except OSError:
        return None


def _push_skipped(stages: list[dict[str, Any]], ids: list[str]) -> None:
    for i in ids:
        st = _iso()
        stages.append(
            {"id": i, "status": "skipped", "artifact_path": None, "started_at": st, "finished_at": st}
        )


def _write_hydration_run(
    p_run: Path,
    *,
    run_id: str,
    exit_code: int,
    errors: list[dict[str, str]],
    warnings: list[dict[str, str]],
    inputs: dict[str, Any],
    timing_ms: int,
    stages: list[dict[str, Any]],
    source_config: dict[str, Any],
    ast_evidence_path: str | None,
    retrieval_path: str | None,
    code_walk_trace_path: str | None,
    intent_hydration_path: str | None,
    intent_bootstrap_path: str | None,
    question_refinement_path: str | None,
    conflict_context_path: str | None,
    repo_structure_path: str | None,
    prior_run_path: str | None,
) -> None:
    status = "ok" if exit_code == EXIT_OK else ("partial" if exit_code == EXIT_PARTIAL else "failed")
    body: dict[str, Any] = {
        "schema": "tonic-hydration-run",
        "version": "1",
        "run_id": run_id,
        "status": status,
        "exit_code": exit_code,
        "errors": errors,
        "warnings": warnings,
        "inputs": inputs,
        "timing_ms": timing_ms,
        "ast_evidence_path": ast_evidence_path,
        "retrieval_path": retrieval_path,
        "tags_patch_path": None,
        "code_walk_trace_path": code_walk_trace_path,
        "intent_hydration_path": intent_hydration_path,
        "intent_bootstrap_path": intent_bootstrap_path,
        "question_refinement_path": question_refinement_path,
        "conflict_context_path": conflict_context_path,
        "repo_structure_path": repo_structure_path,
        "prior_run_path": prior_run_path,
        "pipeline": {"stages": stages, "source_config": source_config},
    }
    _write_json(p_run, body)


def run_hydration_pipeline(
    repo_root: str,
    out_dir: str,
    *,
    env: dict[str, str] | None = None,
    left_intent: str = "",
    right_intent: str = "",
    intent_pair: str = "",
    intent_profile: str = "",
    hydration_config_path: str = "",
    question_mode_cli: Literal["off", "improver", "subquestions"] | None = None,
    strict_llm: bool | None = None,
    llm_model: str | None = None,
    llm_base_url: str | None = None,
    openai_api_key_env: str | None = None,
    ast_argv: list[str] | None = None,
    enable_retrieval: bool = False,
    retrieval_backend: str = "memory",
    retrieval_hybrid_regex: str = "",
    retrieval_symbol_boost: str = "",
    enable_code_walk: bool = False,
    enable_code_walk_agent: bool = False,
    enable_code_walk_search_agent: bool = False,
    user_query: str = "",
    follow_up: str = "",
    prior_run: str = "",
    hydrate_phase_max: int = HYDRATE_PHASE_ALL,
    force_prior_run: bool = False,
    source_priority: Literal["default", "ast-first", "retrieval-first"] = "default",
    vector_cache_path: str = "",
    vector_cache_mode: str = "",
) -> int:
    env = env or {}
    t0 = time.time() * 1000
    run_id = str(uuid.uuid4())
    repo = Path(repo_root).resolve()
    out = Path(out_dir).resolve()
    ast_argv = list(ast_argv or [])
    stages: list[dict[str, Any]] = []

    repo_head = _read_repo_head(repo)
    ruleset_hash_val: str | None = None
    conflict_gate_extra: dict[str, Any] = {}

    def run_inputs() -> dict[str, Any]:
        return {
            "repo": str(repo).replace("\\", "/"),
            "out_dir": str(out).replace("\\", "/"),
            "prior_run": prior_run or None,
            "repo_head": repo_head,
            "ruleset_hash": ruleset_hash_val,
            "user_query": (user_query or "").strip() or None,
            "follow_up": (follow_up or "").strip() or None,
            **conflict_gate_extra,
        }

    warnings: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []
    exit_code = EXIT_OK
    px = hydrate_phase_max
    loaded_prior: dict[str, Any] | None = None

    p_boot = out / "intent-bootstrap.json"
    p_ref = out / "question-refinement.json"
    p_ref_pass1 = out / "question-refinement.pass1.v1.json"
    p_ref_pass2 = out / "question-refinement.pass2.v1.json"
    p_ref_post = out / "question-refinement.post-retrieval.v1.json"
    p_hunk = out / "conflict-hunk-excerpts.json"
    p_rs = out / "repo-structure.json"
    p_cc = out / "conflict-context.json"
    p_ast = out / "ast-hydration.json"
    p_run = out / "hydration-run.json"
    p_intent = out / "intent-hydration.json"
    p_ret = out / "retrieval-hydration.json"
    p_cw = out / "code-walk-trace.json"

    cfg = resolve_hydration_config(
        hydration_config_path or None,
        env,
        question_mode_cli=question_mode_cli,
        strict_llm=strict_llm,
        llm_model=llm_model,
        llm_base_url=llm_base_url,
        openai_api_key_env=openai_api_key_env,
    )

    prior_trim = (prior_run or "").strip()
    if prior_trim:
        pr = Path(prior_trim)
        if not pr.is_absolute():
            pr = (repo / prior_trim).resolve()
        if not pr.is_file():
            print(f"merge-tonic hydrate: --prior-run file not found: {pr}", file=sys.stderr)
            return EXIT_INVALID_ARGS
        try:
            doc = json.loads(pr.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"merge-tonic hydrate: invalid --prior-run JSON: {e}", file=sys.stderr)
            return EXIT_INVALID_ARGS
        loaded_prior = {
            "file": pr,
            "doc": doc,
            "retrieval": _resolve_art(pr, doc.get("retrieval_path")),
            "code_walk": _resolve_art(pr, doc.get("code_walk_trace_path")),
        }
        ins = doc.get("inputs") or {}
        p_repo = str(ins.get("repo") or "").replace("\\", "/").strip()
        cur = str(repo).replace("\\", "/")
        if p_repo and p_repo != cur:
            if not force_prior_run:
                print(
                    "merge-tonic hydrate: prior run repo mismatch; use --force-prior to override.\n"
                    f"  prior: {p_repo}\n  current: {cur}",
                    file=sys.stderr,
                )
                return EXIT_INVALID_ARGS
            warnings.append(
                {"code": "prior_run_repo_mismatch", "message": f"prior run repo overridden ({p_repo} vs {cur})"}
            )
        p_head = str(ins.get("repo_head") or "").strip()
        if p_head and repo_head and p_head != repo_head and not force_prior_run:
            print(
                "merge-tonic hydrate: prior run repo_head mismatch; use --force-prior.\n"
                f"  prior: {p_head}\n  current: {repo_head}",
                file=sys.stderr,
            )
            return EXIT_INVALID_ARGS

    ast_opts = parse_ast_grep_hydrate_argv(
        ["--repo", str(repo), "--out", str(p_ast), "--run-out", str(p_run)] + ast_argv
    )
    ruleset_hash_val = _hash_ruleset(repo, ast_opts.ruleset)
    if loaded_prior and ruleset_hash_val:
        ins = (loaded_prior["doc"].get("inputs") or {}) if loaded_prior else {}
        prior_rh = str(ins.get("ruleset_hash") or "").strip()
        if prior_rh and prior_rh != ruleset_hash_val:
            if not force_prior_run:
                print(
                    "merge-tonic hydrate: prior run ruleset_hash mismatch; use --force-prior to override.\n"
                    f"  prior: {prior_rh}\n  current: {ruleset_hash_val}",
                    file=sys.stderr,
                )
                return EXIT_INVALID_ARGS
            warnings.append(
                {
                    "code": "prior_run_ruleset_mismatch",
                    "message": "ruleset fingerprint differed from prior run; continuing due to --force-prior",
                }
            )

    eff_backend = (env.get("TONIC_RETRIEVAL_BACKEND") or retrieval_backend or "memory").strip().lower()

    def mk_source() -> dict[str, Any]:
        return {
            "retrieval": enable_retrieval,
            "retrieval_backend": eff_backend,
            "code_walk": enable_code_walk,
            "code_walk_agent": enable_code_walk_agent,
            "code_walk_search_agent": enable_code_walk_search_agent,
            "source_priority": source_priority,
        }

    empty_conflict: dict[str, Any] = {
        "schema": "tonic-conflict-context",
        "version": "1",
        "scan_scope": "workspace",
        "conflict_regions": [],
    }
    conflict_art: dict[str, Any] = dict(empty_conflict)
    skip_conflict_scan = (env.get("TONIC_SKIP_CONFLICT_SCAN") or "").strip() == "1"
    conflict_hunk_stored: dict[str, Any] | None = None
    question_refinement_chain: list[dict[str, str]] = []
    post_retrieval_art: dict[str, Any] | None = None

    if px >= HYDRATE_PHASE_CONFLICTS:
        st_cc0 = _iso()
        if skip_conflict_scan:
            conflict_art = {**empty_conflict, "scan_scope": "skipped"}
            write_conflict_context(str(p_cc), conflict_art)
            stages.append(
                {
                    "id": "conflicts",
                    "status": "skipped",
                    "artifact_path": str(p_cc).replace("\\", "/"),
                    "started_at": st_cc0,
                    "finished_at": _iso(),
                }
            )
        else:
            conflict_art = scan_repo_conflict_markers(repo)
            write_conflict_context(str(p_cc), conflict_art)
            stages.append(
                {
                    "id": "conflicts",
                    "status": "ok",
                    "artifact_path": str(p_cc).replace("\\", "/"),
                    "started_at": st_cc0,
                    "finished_at": _iso(),
                }
            )
            gate = evaluate_conflict_gate(env, len(conflict_art.get("conflict_regions") or []))
            conflict_gate_extra.clear()
            conflict_gate_extra["conflict_gate"] = gate["outcome"]
            h_art0 = build_conflict_hunk_excerpts(str(repo), conflict_art, env)
            conflict_hunk_stored = h_art0
            _write_json(p_hunk, h_art0)
            if gate["should_stop"]:
                warnings.append(
                    {
                        "code": "conflict_gate_stop",
                        "message": str((gate["outcome"] or {}).get("stop_reason") or "conflict gate"),
                    }
                )
                exit_code = int(gate["exit_code"])
                _push_skipped(
                    stages,
                    [
                        "intent_bootstrap",
                        "repo_structure",
                        "question_refinement",
                        "ast_grep",
                        "retrieval",
                        "code_walk",
                        "intent_bundle",
                    ],
                )
                _write_hydration_run(
                    p_run,
                    run_id=run_id,
                    exit_code=exit_code,
                    errors=errors,
                    warnings=warnings,
                    inputs=run_inputs(),
                    timing_ms=int(time.time() * 1000 - t0),
                    stages=stages,
                    source_config=mk_source(),
                    ast_evidence_path=None,
                    retrieval_path=None,
                    code_walk_trace_path=None,
                    intent_hydration_path=None,
                    intent_bootstrap_path=None,
                    question_refinement_path=None,
                    conflict_context_path=str(p_cc).replace("\\", "/"),
                    repo_structure_path=None,
                    prior_run_path=prior_run.replace("\\", "/") if prior_run else None,
                )
                return exit_code

    if skip_conflict_scan:
        h_art1 = build_conflict_hunk_excerpts(str(repo), conflict_art, env)
        conflict_hunk_stored = h_art1
        _write_json(p_hunk, h_art1)

    if px < HYDRATE_PHASE_INTENT_BOOTSTRAP:
        _push_skipped(
            stages,
            [
                "intent_bootstrap",
                "repo_structure",
                "question_refinement",
                "ast_grep",
                "retrieval",
                "code_walk",
                "intent_bundle",
            ],
        )
        _write_hydration_run(
            p_run,
            run_id=run_id,
            exit_code=exit_code,
            errors=errors,
            warnings=warnings,
            inputs=run_inputs(),
            timing_ms=int(time.time() * 1000 - t0),
            stages=stages,
            source_config=mk_source(),
            ast_evidence_path=None,
            retrieval_path=None,
            code_walk_trace_path=None,
            intent_hydration_path=None,
            intent_bootstrap_path=None,
            question_refinement_path=None,
            conflict_context_path=str(p_cc).replace("\\", "/"),
            repo_structure_path=None,
            prior_run_path=prior_run.replace("\\", "/") if prior_run else None,
        )
        return exit_code

    # intent_bootstrap
    try:
        st = _iso()
        boot = resolve_intent_bootstrap(
            repo_root=str(repo),
            left_intent_flag=left_intent,
            right_intent_flag=right_intent,
            intent_pair=intent_pair,
            intent_profile_path=intent_profile,
            env=env,
            user_query=user_query,
            follow_up=follow_up,
        )
        write_intent_bootstrap(str(p_boot), boot)
        stages.append(
            {
                "id": "intent_bootstrap",
                "status": "ok",
                "artifact_path": str(p_boot).replace("\\", "/"),
                "started_at": st,
                "finished_at": _iso(),
            }
        )
    except Exception as e:
        msg = str(e)
        errors.append({"code": "intent_bootstrap", "message": msg})
        stages.append({"id": "intent_bootstrap", "status": "failed", "started_at": _iso(), "finished_at": _iso()})
        _fail_run(
            p_run,
            run_id=run_id,
            exit_code=EXIT_INVALID_ARGS,
            errors=errors,
            warnings=warnings,
            inputs=run_inputs(),
            timing_ms=int(time.time() * 1000 - t0),
            stages=stages,
            source_config=mk_source(),
        )
        return EXIT_INVALID_ARGS

    boot_artifact = json.loads(p_boot.read_text(encoding="utf-8"))

    rs_art = summarize_repo_structure(str(repo))
    repo_excerpt = repo_structure_excerpt(rs_art)

    question_art: dict[str, Any] | None = None
    refinement_mode = cfg.question_mode

    if px < HYDRATE_PHASE_REPO_STRUCTURE:
        _push_skipped(
            stages,
            ["repo_structure", "question_refinement", "ast_grep", "retrieval", "code_walk", "intent_bundle"],
        )
        _write_hydration_run(
            p_run,
            run_id=run_id,
            exit_code=exit_code,
            errors=errors,
            warnings=warnings,
            inputs=run_inputs(),
            timing_ms=int(time.time() * 1000 - t0),
            stages=stages,
            source_config=mk_source(),
            ast_evidence_path=None,
            retrieval_path=None,
            code_walk_trace_path=None,
            intent_hydration_path=None,
            intent_bootstrap_path=str(p_boot).replace("\\", "/"),
            question_refinement_path=None,
            conflict_context_path=str(p_cc).replace("\\", "/"),
            repo_structure_path=None,
            prior_run_path=prior_run.replace("\\", "/") if prior_run else None,
        )
        return exit_code

    write_repo_structure(str(p_rs), rs_art)
    st_rs = _iso()
    stages.append(
        {
            "id": "repo_structure",
            "status": "ok",
            "artifact_path": str(p_rs).replace("\\", "/"),
            "started_at": st_rs,
            "finished_at": _iso(),
        }
    )

    if px < HYDRATE_PHASE_AST_GREP:
        _push_skipped(stages, ["ast_grep", "retrieval", "code_walk", "intent_bundle"])
        _write_hydration_run(
            p_run,
            run_id=run_id,
            exit_code=exit_code,
            errors=errors,
            warnings=warnings,
            inputs=run_inputs(),
            timing_ms=int(time.time() * 1000 - t0),
            stages=stages,
            source_config=mk_source(),
            ast_evidence_path=None,
            retrieval_path=None,
            code_walk_trace_path=None,
            intent_hydration_path=None,
            intent_bootstrap_path=str(p_boot).replace("\\", "/"),
            question_refinement_path=str(p_ref).replace("\\", "/"),
            conflict_context_path=str(p_cc).replace("\\", "/"),
            repo_structure_path=str(p_rs).replace("\\", "/"),
            prior_run_path=prior_run.replace("\\", "/") if prior_run else None,
        )
        return exit_code

    st_ast = _iso()
    ast_rc = run_ast_grep_hydrate(ast_opts)
    if ast_rc == EXIT_AST_GREP_MISSING:
        errors.append({"code": "ast_grep_missing", "message": "ast-grep binary not found"})
        stages.append({"id": "ast_grep", "status": "failed", "started_at": st_ast, "finished_at": _iso()})
        _fail_run(
            p_run,
            run_id=run_id,
            exit_code=EXIT_AST_GREP_MISSING,
            errors=errors,
            warnings=warnings,
            inputs=run_inputs(),
            timing_ms=int(time.time() * 1000 - t0),
            stages=stages,
            source_config=mk_source(),
        )
        return EXIT_AST_GREP_MISSING
    if ast_rc == EXIT_INVALID_ARGS:
        errors.append({"code": "invalid_args", "message": "invalid ast-grep args"})
        stages.append({"id": "ast_grep", "status": "failed", "started_at": st_ast, "finished_at": _iso()})
        _fail_run(
            p_run,
            run_id=run_id,
            exit_code=EXIT_INVALID_ARGS,
            errors=errors,
            warnings=warnings,
            inputs=run_inputs(),
            timing_ms=int(time.time() * 1000 - t0),
            stages=stages,
            source_config=mk_source(),
        )
        return EXIT_INVALID_ARGS
    if ast_rc == EXIT_SCAN_FAILED:
        errors.append({"code": "scan_failed", "message": "ast-grep scan failed"})
        stages.append({"id": "ast_grep", "status": "failed", "started_at": st_ast, "finished_at": _iso()})
        _fail_run(
            p_run,
            run_id=run_id,
            exit_code=EXIT_SCAN_FAILED,
            errors=errors,
            warnings=warnings,
            inputs=run_inputs(),
            timing_ms=int(time.time() * 1000 - t0),
            stages=stages,
            source_config=mk_source(),
        )
        return EXIT_SCAN_FAILED
    if ast_rc == EXIT_PARTIAL:
        exit_code = EXIT_PARTIAL
    stages.append(
        {
            "id": "ast_grep",
            "status": "partial" if ast_rc == EXIT_PARTIAL else "ok",
            "artifact_path": str(p_ast).replace("\\", "/"),
            "started_at": st_ast,
            "finished_at": _iso(),
        }
    )

    ast_data = json.loads(p_ast.read_text(encoding="utf-8"))
    matches = list(ast_data.get("matches") or [])

    conflict_regions_json = json.dumps(conflict_art.get("conflict_regions") or [])

    if px < HYDRATE_PHASE_QUESTION_REFINEMENT:
        _push_skipped(stages, ["question_refinement", "retrieval", "code_walk", "intent_bundle"])
        _write_hydration_run(
            p_run,
            run_id=run_id,
            exit_code=exit_code,
            errors=errors,
            warnings=warnings,
            inputs=run_inputs(),
            timing_ms=int(time.time() * 1000 - t0),
            stages=stages,
            source_config=mk_source(),
            ast_evidence_path=str(p_ast).replace("\\", "/"),
            retrieval_path=None,
            code_walk_trace_path=None,
            intent_hydration_path=None,
            intent_bootstrap_path=str(p_boot).replace("\\", "/"),
            question_refinement_path=None,
            conflict_context_path=str(p_cc).replace("\\", "/"),
            repo_structure_path=str(p_rs).replace("\\", "/"),
            prior_run_path=prior_run.replace("\\", "/") if prior_run else None,
        )
        return exit_code

    regions_list = list(conflict_art.get("conflict_regions") or []) if isinstance(conflict_art, dict) else []
    hunk_art = conflict_hunk_stored or build_conflict_hunk_excerpts(str(repo), conflict_art, env)
    hunk_json = conflict_hunk_excerpts_to_prompt_json(hunk_art)
    ast_excerpt_json = format_ast_matches_excerpt_json(ast_data, env)
    repo_head_short = ((repo_head or "").strip()[:7]) if repo_head else ""
    merge_hints = merge_branch_hints_from_regions(regions_list)

    pre_r1_hits: list[dict[str, Any]] = []
    skip_pre_r1 = (env.get("TONIC_SKIP_PRE_R1_RETRIEVAL") or "").strip() == "1"
    pre_r1_top_k = max(1, int((env.get("TONIC_PRE_R1_RETRIEVAL_TOPK") or "").strip() or "0") or 6)
    if enable_retrieval and not skip_pre_r1:
        intent_q_pre = f"{boot_artifact['left_intent']} {boot_artifact['right_intent']}"
        queries_pre: list[str] = [intent_q_pre]
        for r in regions_list[:12]:
            if isinstance(r, dict) and r.get("path"):
                queries_pre.append(f"merge conflict {r['path']}")
        merged_env_pre = {**env, "TONIC_RETRIEVAL_BACKEND": eff_backend}
        vc_warn_pre: list[dict[str, str]] = []
        vcd_pre: dict[str, str] = {}
        if ruleset_hash_val:
            vcd_pre["ruleset_hash"] = ruleset_hash_val
        if repo_head:
            vcd_pre["repo_head"] = repo_head
        try:
            pre_r1_hits = run_retrieval_for_hydrate(
                repo_root=str(repo),
                matches=matches,
                queries=queries_pre,
                top_k_per_query=pre_r1_top_k,
                conflict_regions=regions_list,
                env=merged_env_pre,
                vector_cache_path=vector_cache_path,
                vector_cache_mode=vector_cache_mode,
                vector_cache_diagnostics=vcd_pre or None,
                vector_cache_warnings_out=vc_warn_pre,
            )
        except Exception as e:
            msg = str(e)[:500]
            warnings.append({"code": "retrieval_pre_r1_failed", "message": msg})
            if exit_code == EXIT_OK:
                exit_code = EXIT_PARTIAL
        for w in vc_warn_pre:
            warnings.append(dict(w))
        hy_re_pre = (retrieval_hybrid_regex or env.get("TONIC_RETRIEVAL_HYBRID_REGEX") or "").strip() or None
        hy_sym_pre = (retrieval_symbol_boost or env.get("TONIC_RETRIEVAL_SYMBOL") or "").strip() or None
        if hy_re_pre or hy_sym_pre:
            pre_r1_hits = apply_retrieval_hybrid_stage(
                pre_r1_hits, regex_pattern=hy_re_pre, symbol_filter=hy_sym_pre
            )

    pre_r1_json = json.dumps(
        [
            {
                "chunk_id": h.get("chunk_id"),
                "score": h.get("score"),
                "text": str(h.get("text") or "")[:400],
                "metadata": h.get("metadata"),
            }
            for h in pre_r1_hits[:24]
        ],
        indent=2,
    )

    wrote_question_refinement_pass2 = False

    if refinement_mode != "off":
        st = _iso()
        stat, art, skipped, warn, err_c = run_question_refinement(
            mode=refinement_mode,
            config=cfg,
            left_intent=boot_artifact["left_intent"],
            right_intent=boot_artifact["right_intent"],
            conflict_regions_json=conflict_regions_json,
            repo_structure_excerpt=repo_excerpt,
            prior_phases_digest="",
            prior_refinement_pass_label="pass1",
            user_query=user_query,
            follow_up=follow_up,
            conflict_hunks_excerpt_json=hunk_json,
            ast_matches_excerpt_json=ast_excerpt_json,
            retrieval_hits_pre_r1_json=pre_r1_json,
            retrieval_hits_pass2_json="[]",
            repo_head_short=repo_head_short,
            merge_branch_hints=merge_hints,
            env=env,
        )
        if stat == "fail":
            errors.append({"code": "question_refinement", "message": warn or "refinement failed"})
            stages.append(
                {
                    "id": "question_refinement",
                    "status": "failed",
                    "started_at": st,
                    "finished_at": _iso(),
                }
            )
            _fail_run(
                p_run,
                run_id=run_id,
                exit_code=err_c or EXIT_INVALID_ARGS,
                errors=errors,
                warnings=warnings,
                inputs=run_inputs(),
                timing_ms=int(time.time() * 1000 - t0),
                stages=stages,
                source_config=mk_source(),
            )
            return err_c or EXIT_INVALID_ARGS
        if warn:
            warnings.append({"code": "llm_skipped", "message": warn})
            exit_code = EXIT_PARTIAL
        question_art = art
        write_question_refinement(str(p_ref_pass1), question_art)
        write_question_refinement(str(p_ref), question_art)
        question_refinement_chain.append({"pass_id": "pass1", "path": str(p_ref_pass1).replace("\\", "/")})
        stages.append(
            {
                "id": "question_refinement",
                "status": "partial" if skipped else "ok",
                "artifact_path": str(p_ref).replace("\\", "/"),
                "started_at": st,
                "finished_at": _iso(),
            }
        )
    else:
        st = _iso()
        stat, art, _, _, _ = run_question_refinement(
            mode="off",
            config=cfg,
            left_intent=boot_artifact["left_intent"],
            right_intent=boot_artifact["right_intent"],
            conflict_regions_json=conflict_regions_json,
            repo_structure_excerpt=repo_excerpt,
            prior_refinement_pass_label="off",
            user_query=user_query,
            follow_up=follow_up,
            conflict_hunks_excerpt_json=hunk_json,
            ast_matches_excerpt_json=ast_excerpt_json,
            retrieval_hits_pre_r1_json=pre_r1_json,
            retrieval_hits_pass2_json="[]",
            repo_head_short=repo_head_short,
            merge_branch_hints=merge_hints,
            env=env,
        )
        if stat == "ok" and art:
            question_art = art
            write_question_refinement(str(p_ref_pass1), question_art)
            write_question_refinement(str(p_ref), question_art)
            question_refinement_chain.append({"pass_id": "pass1", "path": str(p_ref_pass1).replace("\\", "/")})
        stages.append(
            {
                "id": "question_refinement",
                "status": "ok",
                "artifact_path": str(p_ref).replace("\\", "/"),
                "started_at": st,
                "finished_at": _iso(),
            }
        )

    pass2_retrieval_json = "[]"
    skip_r2_retrieval = (env.get("TONIC_SKIP_R2_RETRIEVAL") or "").strip() == "1"
    r2_top_k = max(1, int((env.get("TONIC_R2_RETRIEVAL_TOPK") or "").strip() or "0") or 8)
    if (
        cfg.refinement_context == "progressive"
        and refinement_mode != "off"
        and question_art
        and enable_retrieval
        and not skip_r2_retrieval
    ):
        intent_left_q = (question_art or {}).get("refined_left_intent") or boot_artifact["left_intent"]
        intent_right_q = (question_art or {}).get("refined_right_intent") or boot_artifact["right_intent"]
        intent_q2 = f"{intent_left_q} {intent_right_q}"
        sub_texts2: list[str] = []
        subs2 = (question_art or {}).get("subquestions")
        if isinstance(subs2, list):
            for s in subs2:
                if isinstance(s, dict) and isinstance(s.get("text"), str):
                    sub_texts2.append(str(s["text"]))
        queries2: list[str] = []
        if source_priority == "retrieval-first":
            queries2.append(intent_q2)
            queries2.extend(sub_texts2)
        else:
            queries2.extend(sub_texts2)
            queries2.append(intent_q2)
        merged_env2 = {**env, "TONIC_RETRIEVAL_BACKEND": eff_backend}
        vc_warn2: list[dict[str, str]] = []
        vcd2: dict[str, str] = {}
        if ruleset_hash_val:
            vcd2["ruleset_hash"] = ruleset_hash_val
        if repo_head:
            vcd2["repo_head"] = repo_head
        try:
            hits2 = run_retrieval_for_hydrate(
                repo_root=str(repo),
                matches=matches,
                queries=queries2,
                top_k_per_query=r2_top_k,
                conflict_regions=regions_list,
                env=merged_env2,
                vector_cache_path=vector_cache_path,
                vector_cache_mode=vector_cache_mode,
                vector_cache_diagnostics=vcd2 or None,
                vector_cache_warnings_out=vc_warn2,
            )
            for w in vc_warn2:
                warnings.append(dict(w))
            hy_re2 = (retrieval_hybrid_regex or env.get("TONIC_RETRIEVAL_HYBRID_REGEX") or "").strip() or None
            hy_sym2 = (retrieval_symbol_boost or env.get("TONIC_RETRIEVAL_SYMBOL") or "").strip() or None
            if hy_re2 or hy_sym2:
                hits2 = apply_retrieval_hybrid_stage(hits2, regex_pattern=hy_re2, symbol_filter=hy_sym2)
            pass2_retrieval_json = json.dumps(
                [
                    {
                        "chunk_id": h.get("chunk_id"),
                        "score": h.get("score"),
                        "text": str(h.get("text") or "")[:400],
                        "metadata": h.get("metadata"),
                    }
                    for h in hits2[:24]
                ],
                indent=2,
            )
        except Exception as e:
            msg = str(e)[:500]
            warnings.append({"code": "retrieval_pass2_failed", "message": msg})
            if exit_code == EXIT_OK:
                exit_code = EXIT_PARTIAL

    if cfg.refinement_context == "progressive" and refinement_mode != "off" and question_art:
        st = _iso()
        left = (question_art or {}).get("refined_left_intent") or boot_artifact["left_intent"]
        right = (question_art or {}).get("refined_right_intent") or boot_artifact["right_intent"]
        prior_digest = (question_art or {}).get("context_digest_sha256") or ""
        if not prior_digest and p_boot.is_file():
            prior_digest = hashlib.sha256(p_boot.read_bytes()).hexdigest()
        stat, art2, skipped, warn, _ = run_question_refinement(
            mode=refinement_mode,
            config=cfg,
            left_intent=str(left),
            right_intent=str(right),
            conflict_regions_json=conflict_regions_json,
            repo_structure_excerpt=repo_excerpt,
            prior_phases_digest=prior_digest,
            prior_refinement_pass_label="pass2",
            user_query=user_query,
            follow_up=follow_up,
            conflict_hunks_excerpt_json=hunk_json,
            ast_matches_excerpt_json=ast_excerpt_json,
            retrieval_hits_pre_r1_json=pre_r1_json,
            retrieval_hits_pass2_json=pass2_retrieval_json,
            repo_head_short=repo_head_short,
            merge_branch_hints=merge_hints,
            env=env,
        )
        if stat == "fail":
            warnings.append({"code": "question_refinement_progressive", "message": warn or "progressive failed"})
            stages.append(
                {
                    "id": "question_refinement_pass2",
                    "status": "failed",
                    "started_at": st,
                    "finished_at": _iso(),
                }
            )
        else:
            if warn:
                warnings.append({"code": "llm_skipped", "message": warn})
                exit_code = EXIT_PARTIAL
            question_art = art2
            write_question_refinement(str(p_ref_pass2), question_art)
            write_question_refinement(str(p_ref), question_art)
            wrote_question_refinement_pass2 = True
            question_refinement_chain.append({"pass_id": "pass2", "path": str(p_ref_pass2).replace("\\", "/")})
            stages.append(
                {
                    "id": "question_refinement_pass2",
                    "status": "partial" if skipped else "ok",
                    "artifact_path": str(p_ref_pass2).replace("\\", "/"),
                    "started_at": st,
                    "finished_at": _iso(),
                }
            )

    intent_left = (question_art or {}).get("refined_left_intent") or boot_artifact["left_intent"]
    intent_right = (question_art or {}).get("refined_right_intent") or boot_artifact["right_intent"]

    retrieval_path: str | None = None
    retrieval_hits: list[dict[str, Any]] = []
    st_ret = _iso()
    if px < HYDRATE_PHASE_RETRIEVAL:
        stages.append(
            {
                "id": "retrieval",
                "status": "skipped",
                "artifact_path": None,
                "started_at": st_ret,
                "finished_at": _iso(),
            }
        )
    elif enable_retrieval:
        intent_q = f"{intent_left} {intent_right}"
        queries: list[str] = []
        subs = (question_art or {}).get("subquestions")
        sub_texts: list[str] = []
        if isinstance(subs, list):
            for s in subs:
                if isinstance(s, dict) and isinstance(s.get("text"), str):
                    sub_texts.append(str(s["text"]))
        if source_priority == "retrieval-first":
            queries.append(intent_q)
            queries.extend(sub_texts)
        else:
            queries.extend(sub_texts)
            queries.append(intent_q)
        regions = conflict_art.get("conflict_regions") if isinstance(conflict_art, dict) else None
        if not isinstance(regions, list):
            regions = []
        merged_env = {**env, "TONIC_RETRIEVAL_BACKEND": eff_backend}
        vc_warn: list[dict[str, str]] = []
        vcd: dict[str, str] = {}
        if ruleset_hash_val:
            vcd["ruleset_hash"] = ruleset_hash_val
        if repo_head:
            vcd["repo_head"] = repo_head
        try:
            retrieval_hits = run_retrieval_for_hydrate(
                repo_root=str(repo),
                matches=matches,
                queries=queries,
                top_k_per_query=8,
                conflict_regions=regions,
                env=merged_env,
                vector_cache_path=vector_cache_path,
                vector_cache_mode=vector_cache_mode,
                vector_cache_diagnostics=vcd or None,
                vector_cache_warnings_out=vc_warn,
            )
        except Exception as e:
            msg = str(e)[:500]
            warnings.append({"code": "retrieval_failed", "message": msg})
            if exit_code == EXIT_OK:
                exit_code = EXIT_PARTIAL
        for w in vc_warn:
            warnings.append(dict(w))
        if eff_backend == "chroma" and not (env.get("TONIC_CHROMA_URL") or "").strip():
            warnings.append(
                {
                    "code": "retrieval_chroma_misconfigured",
                    "message": "retrieval_backend chroma but TONIC_CHROMA_URL unset",
                }
            )
        hy_re = (retrieval_hybrid_regex or env.get("TONIC_RETRIEVAL_HYBRID_REGEX") or "").strip() or None
        hy_sym = (retrieval_symbol_boost or env.get("TONIC_RETRIEVAL_SYMBOL") or "").strip() or None
        if hy_re or hy_sym:
            retrieval_hits = apply_retrieval_hybrid_stage(
                retrieval_hits, regex_pattern=hy_re, symbol_filter=hy_sym
            )
        if retrieval_hits:
            ret_body = {"schema": "tonic-retrieval-hydration", "version": "1", "hits": retrieval_hits}
            status_ret = "ok"
        else:
            ret_body = build_empty_retrieval_artifact()
            status_ret = "partial"
            warnings.append(
                {
                    "code": "retrieval_empty",
                    "message": "retrieval enabled but produced no hits (no indexable chunks or matches)",
                }
            )
            if exit_code == EXIT_OK:
                exit_code = EXIT_PARTIAL
        _write_json(p_ret, ret_body)
        retrieval_path = str(p_ret).replace("\\", "/")
        stages.append(
            {
                "id": "retrieval",
                "status": status_ret,
                "artifact_path": retrieval_path,
                "started_at": st_ret,
                "finished_at": _iso(),
            }
        )
    elif loaded_prior and loaded_prior.get("retrieval") and loaded_prior["retrieval"].is_file():
        try:
            raw = loaded_prior["retrieval"].read_text(encoding="utf-8")
            body = json.loads(raw)
            hits = body.get("hits") if isinstance(body, dict) else None
            retrieval_hits = list(hits) if isinstance(hits, list) else []
            p_ret.write_text(raw, encoding="utf-8")
            retrieval_path = str(p_ret).replace("\\", "/")
            warnings.append(
                {
                    "code": "prior_run_retrieval_chained",
                    "message": "Reused retrieval-hydration artifact from --prior-run (retrieval not enabled on this run).",
                }
            )
            stages.append(
                {
                    "id": "retrieval",
                    "status": "partial" if not retrieval_hits else "ok",
                    "artifact_path": retrieval_path,
                    "started_at": st_ret,
                    "finished_at": _iso(),
                }
            )
        except Exception as e:
            warnings.append({"code": "prior_run_retrieval_chain_failed", "message": str(e)[:400]})
            st2 = _iso()
            stages.append(
                {
                    "id": "retrieval",
                    "status": "skipped",
                    "artifact_path": None,
                    "started_at": st2,
                    "finished_at": st2,
                }
            )
    else:
        stages.append(
            {
                "id": "retrieval",
                "status": "skipped",
                "artifact_path": None,
                "started_at": st_ret,
                "finished_at": _iso(),
            }
        )

    if (
        (env.get("TONIC_POST_RETRIEVAL_REFINEMENT") or "").strip() == "1"
        and retrieval_hits
        and refinement_mode == "improver"
        and question_art
    ):
        st_pr = _iso()
        retrieval_json_pr = json.dumps(
            [
                {
                    "chunk_id": h.get("chunk_id"),
                    "score": h.get("score"),
                    "metadata": h.get("metadata"),
                    "text": str(h.get("text") or "")[:400],
                }
                for h in retrieval_hits[:20]
            ],
            indent=2,
        )
        pr_stat, pr_art, pr_skip, pr_warn, _pr_err = run_post_retrieval_question_refinement(
            config=cfg,
            left_intent=str((question_art or {}).get("refined_left_intent") or intent_left),
            right_intent=str((question_art or {}).get("refined_right_intent") or intent_right),
            conflict_regions_json=conflict_regions_json,
            repo_structure_excerpt=repo_excerpt,
            retrieval_hits_json=retrieval_json_pr,
            user_query=user_query,
            follow_up=follow_up,
            env=env,
        )
        if pr_stat == "fail":
            warnings.append({"code": "post_retrieval_refinement", "message": pr_warn or "post retrieval failed"})
            stages.append(
                {
                    "id": "question_refinement_post_retrieval",
                    "status": "failed",
                    "started_at": st_pr,
                    "finished_at": _iso(),
                }
            )
        else:
            if pr_warn:
                warnings.append({"code": "llm_skipped", "message": pr_warn})
                exit_code = EXIT_PARTIAL
            if pr_art:
                post_retrieval_art = pr_art
                write_question_refinement(str(p_ref_post), pr_art)
                question_refinement_chain.append(
                    {"pass_id": "post_retrieval", "path": str(p_ref_post).replace("\\", "/")}
                )
            if (
                not pr_skip
                and pr_art
                and pr_art.get("refined_left_intent")
                and pr_art.get("refined_right_intent")
                and question_art
            ):
                question_art = {
                    **question_art,
                    "refined_left_intent": pr_art["refined_left_intent"],
                    "refined_right_intent": pr_art["refined_right_intent"],
                    "merge_goals": pr_art.get("merge_goals", question_art.get("merge_goals")),
                    "assumptions": pr_art.get("assumptions", question_art.get("assumptions")),
                }
                write_question_refinement(str(p_ref), question_art)
                if wrote_question_refinement_pass2:
                    write_question_refinement(str(p_ref_pass2), question_art)
            stages.append(
                {
                    "id": "question_refinement_post_retrieval",
                    "status": "partial" if pr_skip else "ok",
                    "artifact_path": str(p_ref_post).replace("\\", "/"),
                    "started_at": st_pr,
                    "finished_at": _iso(),
                }
            )

    intent_left = (question_art or {}).get("refined_left_intent") or boot_artifact["left_intent"]
    intent_right = (question_art or {}).get("refined_right_intent") or boot_artifact["right_intent"]

    code_walk_trace_path: str | None = None
    st_cw = _iso()
    if px < HYDRATE_PHASE_CODE_WALK:
        stages.append(
            {
                "id": "code_walk",
                "status": "skipped",
                "artifact_path": None,
                "started_at": st_cw,
                "finished_at": _iso(),
            }
        )
    elif enable_code_walk:
        trace = build_batch_code_walk_trace(
            retrieval_hits=retrieval_hits,
            conflict_region_count=len(conflict_art.get("conflict_regions") or [])
            if isinstance(conflict_art, dict)
            else 0,
            ast_match_count=len(matches),
        )
        if enable_code_walk_agent:
            from tonic.hydration.interactive_code_walk import enrich_code_walk_trace_with_llm

            trace = enrich_code_walk_trace_with_llm(
                trace,
                left_intent=str(intent_left),
                right_intent=str(intent_right),
                retrieval_hits=retrieval_hits,
                env=env,
            )
        if enable_code_walk_search_agent and retrieval_hits:
            from tonic.hydration.code_search_agent import run_code_search_agent_for_hydrate

            agent_steps = run_code_search_agent_for_hydrate(
                repo_root=str(repo),
                matches=matches,
                env=env,
                intent_left=str(intent_left),
                intent_right=str(intent_right),
                llm_model=cfg.llm_model,
                llm_base_url=cfg.llm_base_url,
                openai_api_key_env=cfg.openai_api_key_env,
            )
            trace = {**trace, "steps": list(trace.get("steps") or []) + agent_steps}
        _write_json(p_cw, trace)
        code_walk_trace_path = str(p_cw).replace("\\", "/")
        stages.append(
            {
                "id": "code_walk",
                "status": "ok",
                "artifact_path": code_walk_trace_path,
                "started_at": st_cw,
                "finished_at": _iso(),
            }
        )
    elif loaded_prior and loaded_prior.get("code_walk") and loaded_prior["code_walk"].is_file():
        try:
            raw = loaded_prior["code_walk"].read_text(encoding="utf-8")
            p_cw.write_text(raw, encoding="utf-8")
            code_walk_trace_path = str(p_cw).replace("\\", "/")
            warnings.append(
                {
                    "code": "prior_run_code_walk_chained",
                    "message": "Reused code-walk trace from --prior-run (code-walk not enabled on this run).",
                }
            )
            stages.append(
                {
                    "id": "code_walk",
                    "status": "ok",
                    "artifact_path": code_walk_trace_path,
                    "started_at": st_cw,
                    "finished_at": _iso(),
                }
            )
        except Exception as e:
            warnings.append({"code": "prior_run_code_walk_chain_failed", "message": str(e)[:400]})
            st2 = _iso()
            stages.append(
                {
                    "id": "code_walk",
                    "status": "skipped",
                    "artifact_path": None,
                    "started_at": st2,
                    "finished_at": st2,
                }
            )
    else:
        st_skip = _iso()
        stages.append(
            {
                "id": "code_walk",
                "status": "skipped",
                "artifact_path": None,
                "started_at": st_skip,
                "finished_at": st_skip,
            }
        )

    retrieval_arg = (
        {"hits": retrieval_hits, "artifact_path": retrieval_path}
        if retrieval_path and retrieval_hits
        else None
    )
    intent = build_intent_hydration(
        bootstrap=boot_artifact,
        refinement=question_art,
        conflicts=conflict_art,
        ast=ast_data,
        retrieval=retrieval_arg,
        code_walk_trace_path=code_walk_trace_path,
    )
    write_intent_hydration(str(p_intent), intent)
    st_ib = _iso()
    stages.append(
        {
            "id": "intent_bundle",
            "status": "ok",
            "artifact_path": str(p_intent).replace("\\", "/"),
            "started_at": st_ib,
            "finished_at": _iso(),
        }
    )

    timing = int(time.time() * 1000 - t0)
    status = "ok" if exit_code == EXIT_OK else ("partial" if exit_code == EXIT_PARTIAL else "failed")
    body: dict[str, Any] = {
        "schema": "tonic-hydration-run",
        "version": "1",
        "run_id": run_id,
        "status": status,
        "exit_code": exit_code,
        "errors": errors,
        "warnings": warnings,
        "inputs": run_inputs(),
        "timing_ms": timing,
        "ast_evidence_path": str(p_ast).replace("\\", "/"),
        "retrieval_path": retrieval_path,
        "tags_patch_path": None,
        "code_walk_trace_path": code_walk_trace_path,
        "intent_hydration_path": str(p_intent).replace("\\", "/"),
        "intent_bootstrap_path": str(p_boot).replace("\\", "/"),
        "question_refinement_path": str(p_ref).replace("\\", "/"),
        "conflict_context_path": str(p_cc).replace("\\", "/"),
        "repo_structure_path": str(p_rs).replace("\\", "/"),
        "prior_run_path": prior_run.replace("\\", "/") if prior_run else None,
        "pipeline": {"stages": stages, "source_config": mk_source()},
    }
    if question_refinement_chain:
        body["question_refinement_chain"] = question_refinement_chain
    if post_retrieval_art:
        body["question_refinement_post_retrieval_path"] = str(p_ref_post).replace("\\", "/")
    _write_json(p_run, body)
    return exit_code


def parse_hydrate_argv(argv: list[str]) -> dict[str, Any]:
    av = list(argv)

    def get_arg(names: list[str], default: str = "") -> str:
        for i, a in enumerate(av):
            if a in names and i + 1 < len(av) and not av[i + 1].startswith("-"):
                return av[i + 1]
        return default

    def has_flag(names: list[str]) -> bool:
        return any(x in av for x in names)

    hydrate_flags = {
        "--repo",
        "-R",
        "--out-dir",
        "--hydration-config",
        "--left-intent",
        "--right-intent",
        "--intent-pair",
        "--intent-profile",
        "--question-mode",
        "--strict-llm",
        "--llm-model",
        "--llm-base-url",
        "--openai-api-key-env",
        "--enable-retrieval",
        "--source-retrieval",
        "--enable-code-walk",
        "--source-code-walk",
        "--prior-run",
        "--user-query",
        "--follow-up",
        "--enable-code-walk-agent",
        "--enable-code-walk-search-agent",
        "--retrieval-backend",
        "--retrieval-hybrid-regex",
        "--retrieval-symbol-boost",
        "--embedding-backend",
        "--phase",
        "--force-prior",
        "--source-priority",
        "--vector-cache-path",
        "--vector-cache-mode",
    }
    bool_hydrate = {
        "--strict-llm",
        "--enable-retrieval",
        "--source-retrieval",
        "--enable-code-walk",
        "--source-code-walk",
        "--enable-code-walk-agent",
        "--enable-code-walk-search-agent",
        "--force-prior",
    }

    repo = str(Path(get_arg(["--repo", "-R"], ".")).resolve())
    out_dir = get_arg(["--out-dir"], str(Path(repo) / ".tonic" / "hydrate-out"))
    qm_raw = get_arg(["--question-mode"], "").lower()
    qm: Literal["off", "improver", "subquestions"] | None = None
    if qm_raw in ("off", "improver", "subquestions"):
        qm = qm_raw  # type: ignore[assignment]

    ast_extra: list[str] = []
    i = 0
    while i < len(av):
        a = av[i]
        if a == "--":
            ast_extra.extend(av[i:])
            break
        if a in hydrate_flags:
            if a not in bool_hydrate and i + 1 < len(av) and not av[i + 1].startswith("-"):
                i += 2
            else:
                i += 1
            continue
        ast_extra.append(a)
        i += 1

    return {
        "repo": repo,
        "out_dir": out_dir,
        "left_intent": get_arg(["--left-intent"], ""),
        "right_intent": get_arg(["--right-intent"], ""),
        "intent_pair": get_arg(["--intent-pair"], ""),
        "intent_profile": get_arg(["--intent-profile"], ""),
        "hydration_config": get_arg(["--hydration-config"], ""),
        "question_mode": qm,
        "strict_llm": has_flag(["--strict-llm"]),
        "llm_model": get_arg(["--llm-model"], ""),
        "llm_base_url": get_arg(["--llm-base-url"], ""),
        "openai_api_key_env": get_arg(["--openai-api-key-env"], ""),
        "enable_retrieval": has_flag(["--enable-retrieval", "--source-retrieval"]),
        "enable_code_walk": has_flag(["--enable-code-walk", "--source-code-walk"]),
        "prior_run": get_arg(["--prior-run"], ""),
        "user_query": get_arg(["--user-query"], ""),
        "follow_up": get_arg(["--follow-up"], ""),
        "enable_code_walk_agent": has_flag(["--enable-code-walk-agent"]),
        "enable_code_walk_search_agent": has_flag(["--enable-code-walk-search-agent"]),
        "retrieval_backend": get_arg(["--retrieval-backend"], "memory").strip().lower() or "memory",
        "retrieval_hybrid_regex": get_arg(["--retrieval-hybrid-regex"], ""),
        "retrieval_symbol_boost": get_arg(["--retrieval-symbol-boost"], ""),
        "embedding_backend": get_arg(["--embedding-backend"], ""),
        "hydrate_phase": get_arg(["--phase"], ""),
        "force_prior": has_flag(["--force-prior"]),
        "source_priority_raw": get_arg(["--source-priority"], ""),
        "vector_cache_path": get_arg(["--vector-cache-path"], ""),
        "vector_cache_mode": get_arg(["--vector-cache-mode"], ""),
        "ast_argv": ast_extra,
    }


def cmd_hydrate(argv: list[str]) -> int:
    import os

    m = parse_hydrate_argv(argv)
    px, perr = parse_hydrate_phase(m.get("hydrate_phase") or "")
    if perr:
        print(perr, file=sys.stderr)
        return EXIT_INVALID_ARGS
    sp_raw = (m.get("source_priority_raw") or "").strip().lower()
    if not sp_raw or sp_raw == "default":
        sp: Literal["default", "ast-first", "retrieval-first"] = "default"
    elif sp_raw == "ast-first":
        sp = "ast-first"
    elif sp_raw == "retrieval-first":
        sp = "retrieval-first"
    else:
        print(
            f'merge-tonic hydrate: unknown --source-priority "{sp_raw}". Use default | ast-first | retrieval-first.',
            file=sys.stderr,
        )
        return EXIT_INVALID_ARGS
    env = dict(os.environ)
    eb = (m.get("embedding_backend") or "").strip()
    if eb:
        env["TONIC_EMBEDDING_BACKEND"] = eb
    vcp = (m.get("vector_cache_path") or "").strip()
    vcm = (m.get("vector_cache_mode") or "").strip()
    if vcp:
        env["TONIC_VECTOR_CACHE_PATH"] = vcp
    if vcm:
        env["TONIC_VECTOR_CACHE_MODE"] = vcm
    return run_hydration_pipeline(
        m["repo"],
        m["out_dir"],
        env=env,
        left_intent=m["left_intent"],
        right_intent=m["right_intent"],
        intent_pair=m["intent_pair"],
        intent_profile=m["intent_profile"],
        hydration_config_path=m["hydration_config"],
        question_mode_cli=m["question_mode"],
        strict_llm=m["strict_llm"] if m["strict_llm"] else None,
        llm_model=m["llm_model"] or None,
        llm_base_url=m["llm_base_url"] or None,
        openai_api_key_env=m["openai_api_key_env"] or None,
        ast_argv=m["ast_argv"],
        enable_retrieval=m["enable_retrieval"],
        retrieval_backend=m["retrieval_backend"],
        retrieval_hybrid_regex=m["retrieval_hybrid_regex"],
        retrieval_symbol_boost=m["retrieval_symbol_boost"],
        enable_code_walk=m["enable_code_walk"],
        enable_code_walk_agent=m["enable_code_walk_agent"],
        enable_code_walk_search_agent=m["enable_code_walk_search_agent"],
        user_query=m["user_query"],
        follow_up=m["follow_up"],
        prior_run=m["prior_run"],
        hydrate_phase_max=px,
        force_prior_run=bool(m.get("force_prior")),
        source_priority=sp,
        vector_cache_path=vcp,
        vector_cache_mode=vcm,
    )
