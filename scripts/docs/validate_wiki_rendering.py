#!/usr/bin/env python3
"""Validate wiki markdown page names and basic rendering constraints."""

from __future__ import annotations

import re
import sys
from pathlib import Path


WIKI_DIR = Path("wiki-src")
VALID_PAGE = re.compile(r"^[A-Za-z0-9@._-]+\.md$")
FORBIDDEN = set(':#?%\\')


def main() -> int:
    if not WIKI_DIR.exists():
        raise SystemExit("missing wiki-src directory")

    bad: list[str] = []
    for path in sorted(WIKI_DIR.glob("*.md")):
        name = path.name
        if not VALID_PAGE.match(name):
            bad.append(f"{name}: invalid filename pattern")
        if any(c in FORBIDDEN for c in name):
            bad.append(f"{name}: contains forbidden character")
        if " " in name:
            bad.append(f"{name}: contains spaces; use hyphenated slugs")

    if bad:
        print("wiki rendering validation failed:")
        for line in bad:
            print(f"- {line}")
        return 1
    print("wiki rendering validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
