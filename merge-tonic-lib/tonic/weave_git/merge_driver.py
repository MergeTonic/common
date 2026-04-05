"""Git merge driver Option A: `merge_states` on full weave states with merge-base check."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping

from tonic import current_lines, initial_state, merge_states

from .hashutil import canonical_text_lines, normalize_lf, sha256_hex_bytes
from .manifest import path_entry_for_file
from .replay import state_hash
from .types import PathManifestEntry
from .verify import weave_blob_path


@dataclass
class MergeDriverResult:
    exit_code: int
    merged_text: str
    manifest_entry: PathManifestEntry | None
    stderr: list[str]
    serialized_weave: str | None = None


LoadStateFn = Callable[[], str | None]


def merge_driver_exit_code_for_annotated(annotated_lines: list[str]) -> int:
    """Git merge drivers return 1 when the merged file still contains conflict markers."""
    return 1 if any("<<<<<<<" in line for line in annotated_lines) else 0


def merge_driver_compatibility_errors(
    *,
    text_base: str,
    text_ours: str,
    text_theirs: str,
    s_base: str,
    s_ours: str,
    s_theirs: str,
    weave_format_version: str,
    diff_engine_id: str,
    manifest_entry_base: Mapping[str, Any] | None = None,
    manifest_entry_ours: Mapping[str, Any] | None = None,
    manifest_entry_theirs: Mapping[str, Any] | None = None,
) -> list[str]:
    """§5.4 step 4: text ↔ weave alignment, manifest hashes, engine/version, optional parent weave chain."""
    errs: list[str] = []
    triple = [
        ("base", text_base, s_base),
        ("ours", text_ours, s_ours),
        ("theirs", text_theirs, s_theirs),
    ]
    for label, text, state in triple:
        try:
            want_lines = canonical_text_lines(text)
            got_lines = current_lines(state)
        except Exception as e:  # noqa: BLE001
            errs.append(f"{label}: current_lines failed: {e}")
            continue
        if got_lines != want_lines:
            errs.append(
                f"{label}: weave current_lines do not match Git text (replay/text mismatch); "
                f"refuse merge_states without aligned artifacts"
            )

    entries = (manifest_entry_base, manifest_entry_ours, manifest_entry_theirs)
    if any(e is not None for e in entries):
        for label, state, entry in (
            ("base", s_base, manifest_entry_base),
            ("ours", s_ours, manifest_entry_ours),
            ("theirs", s_theirs, manifest_entry_theirs),
        ):
            if entry is None:
                continue
            wss = entry.get("weave_serialized_sha")
            if isinstance(wss, str) and wss and state_hash(state) != wss:
                errs.append(f"{label}: manifest weave_serialized_sha does not match loaded state")
            ve = entry.get("weave_format_version")
            de = entry.get("diff_engine_id")
            if isinstance(ve, str) and ve and ve != weave_format_version:
                errs.append(f"{label}: weave_format_version mismatch (manifest {ve!r} vs driver {weave_format_version!r})")
            if isinstance(de, str) and de and de != diff_engine_id:
                errs.append(f"{label}: diff_engine_id mismatch (manifest {de!r} vs driver {diff_engine_id!r})")

        po = manifest_entry_ours.get("parent_weave_shas") if manifest_entry_ours else None
        pt = manifest_entry_theirs.get("parent_weave_shas") if manifest_entry_theirs else None
        if (
            isinstance(po, list)
            and isinstance(pt, list)
            and len(po) > 0
            and len(pt) > 0
        ):
            bsha = state_hash(s_base)
            if bsha not in po:
                errs.append("ours: parent_weave_shas does not include merge-base weave_serialized_sha")
            if bsha not in pt:
                errs.append("theirs: parent_weave_shas does not include merge-base weave_serialized_sha")

    return errs


def run_option_a_merge(
    *,
    text_base: str,
    text_ours: str,
    text_theirs: str,
    load_state_ours: LoadStateFn,
    load_state_theirs: LoadStateFn,
    load_state_base: LoadStateFn,
    weave_format_version: str,
    diff_engine_id: str,
    strict: bool = True,
    manifest_entry_base: Mapping[str, Any] | None = None,
    manifest_entry_ours: Mapping[str, Any] | None = None,
    manifest_entry_theirs: Mapping[str, Any] | None = None,
) -> MergeDriverResult:
    stderr: list[str] = []
    s_ours = load_state_ours()
    s_theirs = load_state_theirs()
    s_base = load_state_base()
    if s_ours is None or s_theirs is None:
        msg = "missing ours/theirs weave state"
        stderr.append(msg)
        return MergeDriverResult(1, "", None, stderr, None)
    if s_base is None:
        msg = (
            "TONIC_WEAVE_DEGRADED: merge-base weave missing; snapshot merge only. "
            "Strict repos should reject this commit."
        )
        stderr.append(msg)
        if strict:
            return MergeDriverResult(1, "", None, stderr, None)
        left = normalize_lf(text_ours).splitlines()
        right = normalize_lf(text_theirs).splitlines()
        merged_state, ann = merge_states(initial_state(left), initial_state(right))
        text = "\n".join(ann) + ("\n" if ann else "")
        _, entry = path_entry_for_file(
            rel_path=".",
            text_canonical=text,
            serialized_weave=merged_state,
            weave_format_version=weave_format_version,
            diff_engine_id=diff_engine_id,
            degraded=True,
        )
        return MergeDriverResult(
            merge_driver_exit_code_for_annotated(ann), text, entry, stderr, merged_state
        )

    compat = merge_driver_compatibility_errors(
        text_base=text_base,
        text_ours=text_ours,
        text_theirs=text_theirs,
        s_base=s_base,
        s_ours=s_ours,
        s_theirs=s_theirs,
        weave_format_version=weave_format_version,
        diff_engine_id=diff_engine_id,
        manifest_entry_base=manifest_entry_base,
        manifest_entry_ours=manifest_entry_ours,
        manifest_entry_theirs=manifest_entry_theirs,
    )
    for line in compat:
        stderr.append(line)
    if compat:
        msg = "TONIC_WEAVE_MERGE_INCOMPAT: replay/manifest compatibility check failed"
        stderr.append(msg)
        if strict:
            return MergeDriverResult(1, "", None, stderr, None)
        left = normalize_lf(text_ours).splitlines()
        right = normalize_lf(text_theirs).splitlines()
        merged_state, ann = merge_states(initial_state(left), initial_state(right))
        text = "\n".join(ann) + ("\n" if ann else "")
        _, entry = path_entry_for_file(
            rel_path=".",
            text_canonical=text,
            serialized_weave=merged_state,
            weave_format_version=weave_format_version,
            diff_engine_id=diff_engine_id,
            degraded=True,
        )
        return MergeDriverResult(
            merge_driver_exit_code_for_annotated(ann), text, entry, stderr, merged_state
        )

    try:
        merged_state, annotated = merge_states(s_ours, s_theirs)
    except Exception as e:  # noqa: BLE001
        stderr.append(f"merge_states failed: {e}")
        return MergeDriverResult(1, "", None, stderr, None)
    lines_out = annotated
    text = "\n".join(lines_out) + ("\n" if lines_out else "")
    _, entry = path_entry_for_file(
        rel_path=".",
        text_canonical=text,
        serialized_weave=merged_state,
        weave_format_version=weave_format_version,
        diff_engine_id=diff_engine_id,
        degraded=False,
    )
    return MergeDriverResult(
        merge_driver_exit_code_for_annotated(lines_out), text, entry, stderr, merged_state
    )


def load_state_from_weave_root(weave_root: Path, weave_serialized_sha: str) -> str | None:
    p = weave_blob_path(weave_root, weave_serialized_sha)
    if not p.is_file():
        return None
    data = p.read_bytes()
    if sha256_hex_bytes(data) != weave_serialized_sha:
        return None
    return data.decode("utf-8")
