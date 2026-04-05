"""Clean/smudge helpers: atomic temp files, LF normalization before hash.

Filters run **without network**. The parent weave for `update_state` during clean MUST
already be local (LFS checkout, blob cache, or `hf weave prefetch`). See TONIC_GIT_INVARIANTS.md.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from .hashutil import normalize_lf, sha256_hex_utf8


def atomic_write_text(path: Path, content: str, encoding: str = "utf-8") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tw-", text=True)
    try:
        with os.fdopen(fd, "w", encoding=encoding, newline="\n") as f:
            f.write(content)
        os.replace(tmp, path)
    finally:
        if os.path.isfile(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass


def canonical_text_for_hash(raw: str) -> tuple[str, str]:
    norm = normalize_lf(raw)
    return norm, sha256_hex_utf8(norm)
