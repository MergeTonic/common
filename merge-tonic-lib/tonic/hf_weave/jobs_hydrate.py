"""Optional helper for `huggingface_hub` `run_job` callers wrapping hydrate-on-Hub."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path


def run_hydrate_job(
    *,
    repo_root: Path | None = None,
    argv_extra: list[str] | None = None,
) -> int:
    """Run `python -m tonic.cli hydrate` with env-driven defaults (Jobs-friendly)."""
    root = repo_root or Path(os.environ.get("HF_JOB_WORKDIR", ".")).resolve()
    out = os.environ.get("HF_JOB_ARTIFACT_DIR") or os.environ.get("TONIC_HYDRATE_OUT") or str(root / ".tonic" / "jobs" / "hydrate-out")
    cmd = [
        os.environ.get("PYTHON", "python"),
        "-m",
        "tonic.cli",
        "hydrate",
        "--repo",
        str(root),
        "--out-dir",
        out,
        *(argv_extra or []),
    ]
    env = {**os.environ, "MERGETONIC_LICENSE_ACCEPTED": os.environ.get("MERGETONIC_LICENSE_ACCEPTED", "1")}
    return subprocess.call(cmd, env=env)
