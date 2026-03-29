"""Tests for GPL-2.0-only CLI acceptance gate."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

FIX = Path(__file__).resolve().parent / "fixtures" / "cli"


def _isolated_env(tmp: Path) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if k != "MERGETONIC_LICENSE_ACCEPTED"}
    env.pop("MERGETONIC_LICENSE_ACCEPTED", None)
    env["HOME"] = str(tmp)
    env["USERPROFILE"] = str(tmp)
    env["PYTHONUTF8"] = "1"
    if os.name == "nt":
        env["APPDATA"] = str(tmp / "Roaming")
    else:
        env["XDG_CONFIG_HOME"] = str(tmp / ".config")
    return env


def test_merge_blocked_without_license(tmp_path: Path) -> None:
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    cp = subprocess.run(
        [sys.executable, "-m", "tonic.cli", "merge", "--left", str(left), "--right", str(right)],
        env=_isolated_env(tmp_path),
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert cp.returncode != 0
    assert "accept-license" in (cp.stderr or "").lower()


def test_help_works_without_license(tmp_path: Path) -> None:
    cp = subprocess.run(
        [sys.executable, "-m", "tonic.cli", "--help"],
        env=_isolated_env(tmp_path),
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert cp.returncode == 0
    assert "merge" in (cp.stdout or "")


def test_accept_license_then_merge(tmp_path: Path) -> None:
    env = _isolated_env(tmp_path)
    acc = subprocess.run(
        [sys.executable, "-m", "tonic.cli", "accept-license"],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert acc.returncode == 0, acc.stderr

    left = FIX / "left.txt"
    right = FIX / "right.txt"
    cp = subprocess.run(
        [sys.executable, "-m", "tonic.cli", "merge", "--left", str(left), "--right", str(right)],
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert cp.returncode == 0
    assert "<<<<<<< begin" in cp.stdout
