"""Shim package to expose local `merge-tonic-lib/tonic` during repo tests."""

from __future__ import annotations

import importlib.util
import pathlib
import sys

_pkg = pathlib.Path(__file__).resolve().parent.parent / "merge-tonic-lib" / "tonic"
_init = _pkg / "__init__.py"
if not _init.exists():
    raise ImportError("merge-tonic-lib/tonic is missing; install with pip install -e ./merge-tonic-lib")

spec = importlib.util.spec_from_file_location(
    "tonic",
    _init,
    submodule_search_locations=[str(_pkg)],
)
if spec is None or spec.loader is None:
    raise ImportError("Failed to load tonic package from merge-tonic-lib/tonic")
_mod = importlib.util.module_from_spec(spec)
sys.modules["tonic"] = _mod
spec.loader.exec_module(_mod)

