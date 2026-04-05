#!/usr/bin/env python3
"""Merge markdown prompts into agents/shared-tonic-ai-prompts/prompts.v1.json."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPTS_HYDRATION = ROOT / "prompts" / "hydration"
PROMPTS_CONFLICT = ROOT / "prompts" / "conflict"
CANONICAL = ROOT / "agents" / "shared-tonic-ai-prompts" / "prompts.v1.json"
CORE_EMBED = ROOT / "packages" / "tonic-core" / "hydration-prompts" / "embed.json"
PY_EMBED = ROOT / "merge-tonic-lib" / "tonic" / "data" / "hydration_prompts_embed.json"

# conflict/*.md uses {{var}}; runtime agents use Python str.format / Node formatTpl with {var}
_VARIANT_TO_KEY = {"default": "default", "enhanced": "enhanced", "context-aware": "context_aware"}
_PREFIX_TO_SECTION = {"system": "system_prompts", "user": "conflict_user", "file": "file_user"}
_GITHUB_SUFFIX_MD = "github-json-response-suffix.md"


def _parse_md(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return {}, text.strip()
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if not m:
        return {}, text.strip()
    fm_raw, body = m.group(1), m.group(2).strip()
    meta: dict[str, str] = {}
    for line in fm_raw.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, body


def _double_brace_to_single(body: str) -> str:
    return re.sub(r"\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}", r"{\1}", body)


def _merge_conflict_prompts(bundle: dict[str, object]) -> None:
    if not PROMPTS_CONFLICT.is_dir():
        return

    suffix_path = PROMPTS_CONFLICT / _GITHUB_SUFFIX_MD
    if suffix_path.is_file():
        _, body = _parse_md(suffix_path)
        bundle["github_json_response_suffix"] = "\n\n" + body.strip()

    for md in sorted(PROMPTS_CONFLICT.glob("*.md")):
        name = md.name
        if name.lower() == "readme.md" or name == _GITHUB_SUFFIX_MD:
            continue
        stem = md.stem
        if "." not in stem:
            continue
        prefix, variant = stem.rsplit(".", 1)
        if prefix not in _PREFIX_TO_SECTION or variant not in _VARIANT_TO_KEY:
            continue
        section_key = _PREFIX_TO_SECTION[prefix]
        json_key = _VARIANT_TO_KEY[variant]
        _, body = _parse_md(md)
        section = bundle.setdefault(section_key, {})
        if not isinstance(section, dict):
            raise TypeError(f"bundle[{section_key!r}] must be a dict")
        section[json_key] = _double_brace_to_single(body.strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Fail if bundle would change")
    args = parser.parse_args()

    if not CANONICAL.is_file():
        raise SystemExit(f"missing {CANONICAL}")

    bundle = json.loads(CANONICAL.read_text(encoding="utf-8"))
    _merge_conflict_prompts(bundle)

    # Rebuild hydration prompts only from markdown (stale keys are dropped when source files are removed).
    hydration: dict[str, str] = {}
    embed: dict[str, str] = {}

    if PROMPTS_HYDRATION.is_dir():
        for md in sorted(PROMPTS_HYDRATION.glob("*.md")):
            meta, body = _parse_md(md)
            key = meta.get("id") or md.stem
            hydration[key] = body
            embed[key] = body.strip()

    bundle["hydration_prompts"] = hydration

    # Hydration runtime uses {{name}} only; reject accidental single-brace {name} (conflict pipeline uses {name}).
    _bad_hydration = re.compile(r"(?<!\{)\{[a-zA-Z_][a-zA-Z0-9_]*\}(?!\})")
    for ek, ev in embed.items():
        m = _bad_hydration.search(ev)
        if m:
            raise SystemExit(
                f"ERROR: hydration embed key {ek!r} contains single-brace token {m.group(0)!r}; "
                "use doubled braces {{var}} for hydration templates."
            )

    CORE_EMBED.parent.mkdir(parents=True, exist_ok=True)
    CORE_EMBED.write_text(json.dumps(embed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    PY_EMBED.parent.mkdir(parents=True, exist_ok=True)
    PY_EMBED.write_text(json.dumps(embed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    out = json.dumps(bundle, indent=2, ensure_ascii=False) + "\n"
    embed_out = json.dumps(embed, indent=2, ensure_ascii=False) + "\n"
    if args.check:
        if CANONICAL.read_text(encoding="utf-8") != out:
            print("ERROR: prompts.v1.json out of date; run: python scripts/generate_prompt_bundle.py")
            return 1
        if not CORE_EMBED.is_file() or CORE_EMBED.read_text(encoding="utf-8") != embed_out:
            print(
                "ERROR: packages/tonic-core/hydration-prompts/embed.json out of date; run: python scripts/generate_prompt_bundle.py",
            )
            return 1
        if not PY_EMBED.is_file() or PY_EMBED.read_text(encoding="utf-8") != embed_out:
            print(
                "ERROR: merge-tonic-lib/tonic/data/hydration_prompts_embed.json out of date; run: python scripts/generate_prompt_bundle.py",
            )
            return 1
        return 0

    CANONICAL.write_text(out, encoding="utf-8")
    print(f"updated {CANONICAL}")
    print(f"updated {CORE_EMBED}")
    print(f"updated {PY_EMBED}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
