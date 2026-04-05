from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from tonic.core import current_lines
from tonic.core.state import deserialize_state, serialize_state

from .hashutil import canonical_text_lines, normalize_lf, sha256_hex_bytes, sha256_hex_utf8
from .manifest import load_manifest_path, parse_manifest_json
from .types import TonicGitManifest


DEFAULT_WEAVE_ROOT = Path(".tonic/weave")


@dataclass
class VerifyResult:
    ok: bool
    status: str
    strict: bool
    errors: list[dict[str, str]] = field(default_factory=list)
    checks: list[dict[str, object]] = field(default_factory=list)

    def report_dict(self, repo_root: str) -> dict[str, object]:
        return {
            "schema": "tonic-weave-verify-report",
            "version": "1",
            "status": "ok" if self.ok else ("failed" if self.strict or not self.errors else "degraded"),
            "strict": self.strict,
            "repo_root": repo_root,
            "checks": self.checks,
            "errors": self.errors,
        }


def _git_staged_paths(repo: Path) -> set[str]:
    try:
        out = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "-z"],
            cwd=repo,
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return set()
    if out.returncode != 0:
        return set()
    raw = out.stdout
    if not raw:
        return set()
    return {p.replace("\\", "/") for p in raw.split("\0") if p}


def weave_blob_path(weave_root: Path, weave_serialized_sha: str) -> Path:
    return weave_root / "blobs" / weave_serialized_sha


def verify_path_local(
    repo_root: Path,
    rel_path: str,
    entry: dict[str, object],
    weave_root: Path,
) -> list[str]:
    errs: list[str] = []
    p = repo_root / rel_path
    if not p.is_file():
        errs.append(f"{rel_path}: missing file")
        return errs
    raw = p.read_text(encoding="utf-8")
    norm = normalize_lf(raw)
    text_sha = sha256_hex_utf8(norm)
    want_text = entry.get("text_blob_sha")
    if not isinstance(want_text, str) or text_sha != want_text:
        errs.append(f"{rel_path}: text_blob_sha mismatch (got {text_sha})")

    wss = entry.get("weave_serialized_sha")
    if not isinstance(wss, str):
        errs.append(f"{rel_path}: invalid weave_serialized_sha in manifest")
        return errs
    blob = weave_blob_path(weave_root, wss)
    if not blob.is_file():
        errs.append(
            f"{rel_path}: missing weave blob at {blob}; "
            f"weave blobs may not be in git — run `hf weave prefetch` / `hf weave push` or commit `.tonic/weave`"
        )
        return errs
    weave_bytes = blob.read_bytes()
    if sha256_hex_bytes(weave_bytes) != wss:
        errs.append(f"{rel_path}: weave blob hash mismatch")
        return errs
    try:
        state_s = weave_bytes.decode("utf-8")
        state = deserialize_state(state_s)
    except Exception as e:  # noqa: BLE001 — surface to caller
        errs.append(f"{rel_path}: deserialize_state failed: {e}")
        return errs
    roundtrip = serialize_state(state).encode("utf-8")
    if sha256_hex_bytes(roundtrip) != wss:
        errs.append(f"{rel_path}: weave round-trip sha mismatch")
    lines = canonical_text_lines(raw)
    try:
        cl = current_lines(state_s)
    except Exception as e:  # noqa: BLE001
        errs.append(f"{rel_path}: current_lines failed: {e}")
        return errs
    if cl != lines:
        errs.append(f"{rel_path}: working tree text does not match weave current_lines")
    return errs


def verify_manifest(
    repo_root: Path,
    manifest: TonicGitManifest,
    *,
    weave_root: Path | None = None,
    only_paths: set[str] | None = None,
    strict: bool = False,
) -> VerifyResult:
    wr = weave_root or (repo_root / DEFAULT_WEAVE_ROOT)
    checks: list[dict[str, object]] = []
    errors: list[dict[str, str]] = []
    paths = manifest.get("paths", {})
    for rel, entry in paths.items():
        if only_paths is not None and rel not in only_paths:
            continue
        if not isinstance(entry, dict):
            errors.append({"code": "bad_entry", "message": f"{rel}: not an object", "path": rel})
            continue
        pe = verify_path_local(repo_root, rel, entry, wr)
        ok = len(pe) == 0
        checks.append({"id": f"path:{rel}", "ok": ok, "message": "; ".join(pe) if pe else "", "path": rel})
        for m in pe:
            errors.append({"code": "verify_path", "message": m, "path": rel})
    # strict: degraded entries forbidden
    if strict:
        for rel, entry in paths.items():
            if only_paths is not None and rel not in only_paths:
                continue
            if isinstance(entry, dict) and entry.get("degraded") is True:
                msg = f"{rel}: degraded manifest row not allowed in strict mode"
                errors.append({"code": "strict_degraded", "message": msg, "path": rel})
                checks.append({"id": f"strict:{rel}", "ok": False, "message": msg, "path": rel})
    ok = len(errors) == 0
    status = "ok" if ok else "failed"
    return VerifyResult(ok=ok, status=status, strict=strict, errors=errors, checks=checks)


def verify_staged(
    repo_root: Path,
    manifest_path: Path,
    *,
    weave_root: Path | None = None,
    strict: bool = False,
) -> VerifyResult:
    manifest = load_manifest_path(manifest_path)
    staged = _git_staged_paths(repo_root)
    if not staged:
        # No git staged files: verify all manifest paths (local dev / tests)
        only = None
    else:
        manifest_paths = set(manifest.get("paths", {}).keys())
        only = manifest_paths & staged
        if not only:
            return VerifyResult(
                ok=True,
                status="ok",
                strict=strict,
                checks=[{"id": "staged", "ok": True, "message": "no staged tonic paths in manifest"}],
            )
    return verify_manifest(repo_root, manifest, weave_root=weave_root, only_paths=only, strict=strict)


def verify_report_json(repo_root: Path, manifest_json: str, **kwargs: object) -> str:
    m = parse_manifest_json(manifest_json)
    vr = verify_manifest(repo_root, m, **kwargs)  # type: ignore[arg-type]
    return json.dumps(vr.report_dict(str(repo_root.resolve())), indent=2)
