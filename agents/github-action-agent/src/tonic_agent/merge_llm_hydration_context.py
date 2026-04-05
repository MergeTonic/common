"""Build merge-LLM user-message appendix from ast/hydration artifacts (parity with Node)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def _norm_rel(p: str) -> str:
    return str(p).replace("\\", "/").lstrip("/")


def _resolve_under_repo(repo_root: Path, p: str | None) -> Path | None:
    if not p or not str(p).strip():
        return None
    s = str(p).strip()
    path = Path(s)
    return path if path.is_absolute() else repo_root / path


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _truncate(s: str, max_len: int) -> str:
    if len(s) <= max_len:
        return s
    return f"{s[:max_len]}\n… [truncated {len(s) - max_len} characters]"


def hydration_context_digest(appendix: str) -> str:
    return hashlib.sha256(appendix.encode("utf-8", errors="replace")).hexdigest()[:32]


def build_merge_llm_hydration_appendix(
    repo_root: str,
    ast_payload: dict[str, Any] | None,
    conflict_rel_path: str,
    *,
    max_chars: int = 14000,
) -> str:
    if not ast_payload or ast_payload.get("mode") == "skipped":
        return ""

    root = Path(repo_root).resolve()
    rel = _norm_rel(conflict_rel_path)
    parts: list[str] = []
    substantive = False

    def push(*lines: str) -> None:
        nonlocal substantive
        parts.extend(lines)
        substantive = True

    run_path = _resolve_under_repo(root, ast_payload.get("hydration_run_path"))
    intent_path = _resolve_under_repo(root, ast_payload.get("intent_hydration_path"))
    ast_path = _resolve_under_repo(root, ast_payload.get("ast_evidence_path"))
    retrieval_path = _resolve_under_repo(root, ast_payload.get("retrieval_path"))
    code_walk_path = _resolve_under_repo(root, ast_payload.get("code_walk_trace_path"))

    run_record: dict[str, Any] | None = None
    if run_path and run_path.is_file():
        run = _read_json(run_path)
        if run:
            run_record = run
            if intent_path is None:
                intent_path = _resolve_under_repo(root, run.get("intent_hydration_path"))
            if ast_path is None:
                ast_path = _resolve_under_repo(root, run.get("ast_evidence_path"))
            if retrieval_path is None:
                retrieval_path = _resolve_under_repo(root, run.get("retrieval_path"))
            if code_walk_path is None:
                code_walk_path = _resolve_under_repo(root, run.get("code_walk_trace_path"))

    if run_record:
        inputs = run_record.get("inputs")
        uq = ""
        fu = ""
        if isinstance(inputs, dict):
            uq_raw = inputs.get("user_query")
            fu_raw = inputs.get("follow_up")
            uq = str(uq_raw).strip() if isinstance(uq_raw, str) else ""
            fu = str(fu_raw).strip() if isinstance(fu_raw, str) else ""
        if uq or fu:
            lines = ["#### User notes"]
            if uq:
                lines.append(_truncate(uq, 2000))
            if fu:
                lines.append(_truncate(fu, 2000))
            lines.append("")
            push(*lines)
        summary: dict[str, Any] = {}
        st = run_record.get("status")
        if isinstance(st, str):
            summary["status"] = st
        ec = run_record.get("exit_code")
        if isinstance(ec, int):
            summary["exit_code"] = ec
        pipe = run_record.get("pipeline")
        if isinstance(pipe, dict):
            stages = pipe.get("stages")
            if isinstance(stages, list):
                ids: list[str] = []
                for s in stages:
                    if isinstance(s, dict) and isinstance(s.get("id"), str):
                        ids.append(str(s["id"]))
                summary["stages"] = ids
        if summary:
            push("#### Run summary", _truncate(json.dumps(summary), 4000), "")

    excerpt = ast_payload.get("prompt_excerpt")
    if isinstance(excerpt, str) and excerpt.strip():
        push("#### Intent bundle excerpt", _truncate(excerpt.strip(), 6000), "")

    if intent_path and intent_path.is_file():
        intent = _read_json(intent_path)
        if intent:
            left = str(intent.get("left_intent") or "")
            right = str(intent.get("right_intent") or "")
            push("#### Recorded intents", f"Left: {left}", f"Right: {right}", "")
            links = intent.get("evidence_links")
            if isinstance(links, list):
                for_file = []
                for x in links:
                    if not isinstance(x, dict):
                        continue
                    p = _norm_rel(str(x.get("path") or ""))
                    if p == rel or p.endswith(f"/{rel}") or rel.endswith(p):
                        for_file.append(x)
                if for_file:
                    push(
                        f"#### Evidence links ({rel})",
                        _truncate(json.dumps(for_file, indent=2), 4000),
                        "",
                    )

    if ast_path and ast_path.is_file():
        ast = _read_json(ast_path)
        if ast:
            matches = ast.get("matches")
            if isinstance(matches, list):
                slice_m = [
                    m
                    for m in matches
                    if isinstance(m, dict) and _norm_rel(str(m.get("path") or "")) == rel
                ][:24]
                if slice_m:
                    push(
                        f"#### AST-grep matches ({rel}, top {len(slice_m)})",
                        _truncate(json.dumps(slice_m, indent=2), 5000),
                        "",
                    )

    if retrieval_path and retrieval_path.is_file():
        ret = _read_json(retrieval_path)
        if ret:
            hits = ret.get("hits")
            if isinstance(hits, list):
                slice_h = []
                for h in hits:
                    if not isinstance(h, dict):
                        continue
                    meta = h.get("metadata")
                    if not isinstance(meta, dict):
                        continue
                    p = _norm_rel(str(meta.get("path") or ""))
                    if p == rel:
                        slice_h.append(h)
                slice_h = slice_h[:12]
                if slice_h:
                    push(
                        f"#### Retrieval hits ({rel}, top {len(slice_h)})",
                        _truncate(json.dumps(slice_h, indent=2), 5000),
                        "",
                    )

    if code_walk_path and code_walk_path.is_file():
        cw = _read_json(code_walk_path)
        if cw:
            push("#### Code-walk trace (excerpt)", _truncate(json.dumps(cw, indent=2), 4000), "")

    if not substantive:
        return ""

    body = "\n".join(
        [
            "### Hydration pipeline context",
            "Use this to align with recorded merge intents and structural/retrieval evidence. "
            "Do not paste artifact JSON verbatim into the resolved file.",
            "",
            *parts,
        ]
    ).strip()
    return _truncate(body, max_chars)
