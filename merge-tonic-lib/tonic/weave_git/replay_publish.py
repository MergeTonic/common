"""Weave replay with optional CTRD publish — shared by merge-tonic weave replay and hf weave sync."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from tonic.hf_weave.client import hub_offline
from tonic.hf_weave.hub_repo_resolve import resolve_hub_repo_id_for_weave

from .manifest import load_manifest_path, save_manifest_path
from .replay import ReplayStep, persist_checkpoint_weave_blob, replay_steps, state_hash
from .verify import DEFAULT_WEAVE_ROOT


def _git_head_sha(repo: Path) -> str | None:
    cp = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if cp.returncode != 0:
        return None
    s = (cp.stdout or "").strip()
    return s or None


def _should_publish_ctrd(*, publish_ctrd_flag: bool) -> bool:
    if publish_ctrd_flag:
        return True
    v = (os.environ.get("TONIC_WEAVE_PUBLISH_CTRD") or "").strip().lower()
    return v in ("1", "true", "yes", "on")


def replay_and_publish_ctrd(
    *,
    repo: Path,
    manifest_path: Path | None = None,
    path: str,
    steps_json: str = "",
    trace_key: str = "",
    from_hub: bool = False,
    publish_ctrd_flag: bool = False,
    checkpoint_every: int = 0,
    persist_checkpoints: str = "",
    json_out: bool = False,
    dry_run: bool = False,
    prefix: str = "weave replay",
    hub_repo_id_arg: str = "",
) -> int:
    """Replay weave steps for one manifest path; optionally build/publish CTRD and update manifest.

    When ``dry_run`` is True and publish would occur, skips Hub upload and manifest write after successful replay.
    """
    repo = repo.resolve()
    mpath = manifest_path if manifest_path is not None else repo / DEFAULT_WEAVE_ROOT / "manifest.json"
    if not mpath.is_file():
        print(f"{prefix}: missing manifest {mpath}", file=sys.stderr)
        return 1
    m = load_manifest_path(mpath)
    if path not in m.get("paths", {}):
        print(f"{prefix}: path not in manifest: {path}", file=sys.stderr)
        return 1
    entry = m["paths"][path]
    steps_path = Path(steps_json) if steps_json else None
    steps: list[ReplayStep] | None = None
    if steps_path and steps_path.is_file():
        raw: Any = json.loads(steps_path.read_text(encoding="utf-8"))
        steps = [ReplayStep(commit=s["commit"], lines=list(s["lines"])) for s in raw]
    else:
        tk = trace_key.strip()
        if (not tk) and from_hub:
            rk = entry.get("replay_trace_key") if isinstance(entry, dict) else None
            if isinstance(rk, str) and rk.strip():
                tk = rk.strip()
        if tk:
            allow_hub = os.environ.get("TONIC_WEAVE_REPLAY_HUB", "1").lower() not in ("0", "false", "no")
            if not allow_hub:
                print(
                    f"{prefix}: TONIC_WEAVE_REPLAY_HUB=0 disables Hub CTRD fetch; pass --steps-json",
                    file=sys.stderr,
                )
                return 1
            rid = resolve_hub_repo_id_for_weave(repo, hub_repo_id_arg).strip()
            if not rid:
                print(
                    f"{prefix}: set .tonic/hf-repo.json repo_id, hub_repo_id in .tonic/repo.json, "
                    "or TONIC_HF_WEAVE_REPO for --from-hub (or pass --repo-id)",
                    file=sys.stderr,
                )
                return 1
            from tonic.hf_weave.ctrd import fetch_ctrd_from_hub

            doc = fetch_ctrd_from_hub(repo_id=rid, ctrd_id=tk)
            if doc is None:
                print(f"{prefix}: CTRD {tk[:16]}… not found on Hub (offline?)", file=sys.stderr)
                return 1
            raw_steps = doc.get("steps")
            if not isinstance(raw_steps, list):
                print(f"{prefix}: CTRD missing steps array", file=sys.stderr)
                return 1
            steps = []
            for s in raw_steps:
                if isinstance(s, dict) and isinstance(s.get("commit"), str):
                    lines = s.get("lines")
                    steps.append(
                        ReplayStep(commit=s["commit"], lines=list(lines) if isinstance(lines, list) else [])
                    )
        if steps is None:
            print(
                f"{prefix}: pass --steps-json, or --trace-key / --from-hub with manifest replay_trace_key "
                "and Hub credentials",
                file=sys.stderr,
            )
            return 1
    pc = persist_checkpoints.strip() if persist_checkpoints else ""
    persist_root = Path(pc).resolve() if pc else None

    def on_checkpoint(_commit: str, ser: str) -> None:
        if persist_root is not None:
            persist_checkpoint_weave_blob(persist_root, ser)

    final, cps = replay_steps(
        steps,
        checkpoint_every=checkpoint_every,
        on_checkpoint=on_checkpoint if persist_root and checkpoint_every else None,
    )
    want = m["paths"][path]["weave_serialized_sha"]
    got = state_hash(final)
    if got != want:
        print(f"{prefix}: hash mismatch want={want} got={got}", file=sys.stderr)
        return 1
    want_publish = _should_publish_ctrd(publish_ctrd_flag=publish_ctrd_flag)
    if want_publish:
        if dry_run:
            if json_out:
                print(
                    json.dumps(
                        {
                            "ok": True,
                            "dry_run": True,
                            "checkpoints": cps,
                            "weave_serialized_sha": got,
                            "would_publish_ctrd": True,
                        },
                        indent=2,
                    )
                )
            else:
                print(f"{prefix}: dry-run ok {got} (would publish CTRD and update manifest)")
            return 0
        if hub_offline(None):
            print(
                f"{prefix}: --publish-ctrd / TONIC_WEAVE_PUBLISH_CTRD requires Hub online "
                "(unset HF_HUB_OFFLINE / TONIC_HF_WEAVE_OFFLINE)",
                file=sys.stderr,
            )
            return 1
        rid = resolve_hub_repo_id_for_weave(repo, hub_repo_id_arg).strip()
        if not rid:
            print(
                f"{prefix}: publish_ctrd needs .tonic/hf-repo.json repo_id, hub_repo_id in .tonic/repo.json, "
                "or TONIC_HF_WEAVE_REPO (or pass --repo-id)",
                file=sys.stderr,
            )
            return 1
        from tonic.hf_weave.ctrd import build_ctrd_document, publish_ctrd_to_hub

        step_dicts = [{"commit": s.commit, "lines": list(s.lines)} for s in steps]
        de = entry.get("diff_engine_id") if isinstance(entry, dict) else None
        wfv = entry.get("weave_format_version") if isinstance(entry, dict) else None
        did_s = de.strip() if isinstance(de, str) and de.strip() else "tonic-v1"
        wfv_s = wfv.strip() if isinstance(wfv, str) and wfv.strip() else "1"
        m_commit = str(m.get("commit") or "")
        _, doc = build_ctrd_document(
            manifest_commit=m_commit,
            path=path,
            steps=step_dicts,
            diff_engine_id=did_s,
            weave_format_version=wfv_s,
            expected_weave_serialized_sha=str(want),
        )
        cid = publish_ctrd_to_hub(repo_id=rid, doc=doc, offline=None)
        paths = dict(m.get("paths") or {})
        prev = paths.get(path)
        row = dict(prev) if isinstance(prev, dict) else {}
        row["replay_trace_key"] = cid
        paths[path] = row
        head = _git_head_sha(repo)
        m2 = {**m, "paths": paths, "commit": head if head else m.get("commit", "0" * 40)}
        save_manifest_path(mpath, m2)  # type: ignore[arg-type]
        if json_out:
            print(
                json.dumps(
                    {"ok": True, "checkpoints": cps, "weave_serialized_sha": got, "ctrd_id": cid},
                    indent=2,
                )
            )
        else:
            print("replay ok", got, "published ctrd", cid[:12] + "…")
        return 0
    if json_out:
        print(json.dumps({"ok": True, "checkpoints": cps, "weave_serialized_sha": got}, indent=2))
    else:
        print("replay ok", got)
    return 0


def replay_and_publish_ctrd_from_args(args: Any, *, prefix: str = "weave replay", dry_run: bool = False) -> int:
    """Adapter from argparse.Namespace to :func:`replay_and_publish_ctrd`."""
    repo = Path(args.repo).resolve()
    m_raw = (getattr(args, "manifest", None) or "").strip()
    mp: Path | None = Path(m_raw) if m_raw else None
    return replay_and_publish_ctrd(
        repo=repo,
        manifest_path=mp,
        path=args.path,
        steps_json=(getattr(args, "steps_json", None) or "") or "",
        trace_key=(getattr(args, "trace_key", None) or "") or "",
        from_hub=bool(getattr(args, "from_hub", False)),
        publish_ctrd_flag=bool(getattr(args, "publish_ctrd", False)),
        checkpoint_every=int(getattr(args, "checkpoint_every", 0) or 0),
        persist_checkpoints=(getattr(args, "persist_checkpoints", None) or "") or "",
        json_out=bool(getattr(args, "json_out", False)),
        dry_run=dry_run,
        prefix=prefix,
        hub_repo_id_arg=(getattr(args, "repo_id", None) or "").strip(),
    )
