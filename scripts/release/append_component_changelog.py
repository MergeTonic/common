#!/usr/bin/env python3
import argparse
from datetime import date
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--component", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--notes", default="Automated release entry.")
    args = parser.parse_args()

    path = Path("CHANGELOG.components.md")
    if not path.exists():
        path.write_text("# Component Changelog\n\n", encoding="utf-8")

    content = path.read_text(encoding="utf-8")
    entry = (
        f"## {args.component} {args.version} ({date.today().isoformat()})\n"
        f"- {args.notes}\n\n"
    )
    path.write_text(content + entry, encoding="utf-8")
    print(f"updated {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
