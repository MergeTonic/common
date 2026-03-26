#!/usr/bin/env python3
"""Normalize markdown links for GitHub wiki pages."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


WIKI_DIR = Path("wiki-src")
WIKI_LINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
MD_LINK_RE = re.compile(r"\(([^)]+\.md)\)")


def normalize_text(text: str) -> str:
    text = MD_LINK_RE.sub(lambda m: f"({m.group(1).replace('.md', '')})", text)
    return text


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize wiki links.")
    parser.add_argument("--check", action="store_true", help="Fail if files would change.")
    args = parser.parse_args()

    changed: list[Path] = []
    for path in sorted(WIKI_DIR.glob("*.md")):
        original = path.read_text(encoding="utf-8")
        normalized = normalize_text(original)
        if normalized != original:
            changed.append(path)
            if not args.check:
                path.write_text(normalized, encoding="utf-8")

    if args.check and changed:
        print("wiki link normalization required:")
        for path in changed:
            print(f"- {path}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
