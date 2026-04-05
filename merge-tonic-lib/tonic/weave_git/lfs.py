"""LFS pointer detection under `.tonic/objects/**` (strict verify)."""

from __future__ import annotations

from pathlib import Path

LFS_POINTER_PREFIX = b"version https://git-lfs.github.com/spec/v1"


def is_lfs_pointer(data: bytes) -> bool:
    return data.startswith(LFS_POINTER_PREFIX)


def find_lfs_pointers_under(root: Path, *, glob: str = "**/*") -> list[Path]:
    out: list[Path] = []
    if not root.is_dir():
        return out
    for p in root.glob(glob):
        if not p.is_file():
            continue
        try:
            head = p.read_bytes()[:64]
        except OSError:
            continue
        if is_lfs_pointer(head):
            out.append(p)
    return out
