"""`git merge` external driver entrypoint: reads %O %A %B paths; states from `TONIC_MERGE_STATE_DIR`."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from .merge_driver import run_option_a_merge
from .merge_manifest_sidecar import load_merge_manifest_sidecar


def _read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if len(argv) != 3:
        print("usage: python -m tonic.weave_git.git_merge_driver <base> <ours> <theirs>", file=sys.stderr)
        return 2
    base_p, ours_p, theirs_p = (Path(a) for a in argv)
    state_root = Path(os.environ.get("TONIC_MERGE_STATE_DIR", "."))

    def load(name: str):
        p = state_root / name
        if not p.is_file():
            return None
        return _read_text(p)

    text_base = _read_text(base_p)
    text_ours = _read_text(ours_p)
    text_theirs = _read_text(theirs_p)
    env_wfv = os.environ.get("TONIC_MERGE_WEAVE_FORMAT_VERSION", "1")
    env_de = os.environ.get("TONIC_MERGE_DIFF_ENGINE_ID", "tonic-v1")
    strict = os.environ.get("TONIC_MERGE_STRICT", "1").lower() not in ("0", "false", "no")

    wfv, de, ent_base, ent_ours, ent_theirs = load_merge_manifest_sidecar(
        state_root,
        default_weave_format_version=env_wfv,
        default_diff_engine_id=env_de,
    )

    r = run_option_a_merge(
        text_base=text_base,
        text_ours=text_ours,
        text_theirs=text_theirs,
        load_state_ours=lambda: load("ours.state"),
        load_state_theirs=lambda: load("theirs.state"),
        load_state_base=lambda: load("base.state"),
        weave_format_version=wfv,
        diff_engine_id=de,
        strict=strict,
        manifest_entry_base=ent_base,
        manifest_entry_ours=ent_ours,
        manifest_entry_theirs=ent_theirs,
    )
    ours_p.write_text(r.merged_text, encoding="utf-8", newline="\n")
    for line in r.stderr:
        print(line, file=sys.stderr)
    return r.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
