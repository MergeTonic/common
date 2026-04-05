"""Load embedded hydration prompt bodies (parity with hydrationPromptTemplate.ts)."""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

_PLACEHOLDER = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")


def apply_hydration_template(template: str, vars: dict[str, str]) -> str:
    def repl(m: re.Match[str]) -> str:
        key = m.group(1)
        return vars[key] if key in vars else m.group(0)

    return _PLACEHOLDER.sub(repl, template)


@lru_cache(maxsize=1)
def _read_embed_file() -> dict[str, str]:
    here = Path(__file__).resolve().parent.parent / "data" / "hydration_prompts_embed.json"
    if here.is_file():
        try:
            raw = json.loads(here.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return {k: str(v) for k, v in raw.items() if isinstance(v, str)}
        except (json.JSONDecodeError, OSError):
            pass
    try:
        from importlib import resources as ir

        ref = ir.files("tonic.data").joinpath("hydration_prompts_embed.json")
        if ref.is_file():
            raw = json.loads(ref.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return {k: str(v) for k, v in raw.items() if isinstance(v, str)}
    except (ImportError, OSError, json.JSONDecodeError, TypeError):
        pass
    return {}


def reset_hydration_prompt_cache_for_tests() -> None:
    _read_embed_file.cache_clear()


def load_hydration_prompt_body(template_id: str) -> str | None:
    d = os.environ.get("TONIC_PROMPTS_DIR", "").strip()
    if d:
        base = Path(d).resolve()
        if base.is_dir():
            for fp in sorted(base.glob("*.md")):
                try:
                    text = fp.read_text(encoding="utf-8")
                except OSError:
                    continue
                meta, body = _parse_md_frontmatter(text)
                if meta.get("id", "").strip() == template_id:
                    return body.strip()
    return _read_embed_file().get(template_id)


def _parse_md_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        return {}, text.strip()
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if not m:
        return {}, text.strip()
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, m.group(2).strip()
