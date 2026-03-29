"""GPL-2.0-only acceptance record for the merge-tonic CLI."""

from __future__ import annotations

import os
import sys
from pathlib import Path

LICENSE_GATE_MESSAGE = (
    "You must accept the GNU GPL-2.0-only license before using merge-tonic. "
    "Run: merge-tonic accept-license  "
    "(or set MERGETONIC_LICENSE_ACCEPTED=1 for automation)."
)


def acceptance_path() -> Path:
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming")))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config")))
    return base / "mergetonic" / "license-accepted"


def license_accepted() -> bool:
    if os.environ.get("MERGETONIC_LICENSE_ACCEPTED") == "1":
        return True
    return acceptance_path().is_file()


def cmd_accept_license() -> int:
    print(
        "Merge Tonic (merge-tonic) is licensed under GNU GPL-2.0-only. "
        "See LICENSE in the package or https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt",
        file=sys.stderr,
    )
    p = acceptance_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("1\n", encoding="utf-8")
    print(f"License accepted. Record saved at {p}")
    return 0
