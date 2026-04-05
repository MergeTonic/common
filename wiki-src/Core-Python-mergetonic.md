# Core Python: mergetonic

## What it is

Python implementation of the deterministic Tonic weave merge engine, Git helpers, optional hydration pipeline, and ast-grep integration.

## Install

```bash
pip install mergetonic
# Optional extras (see pyproject): dev, ai (Chroma, etc.), hf-weave
```

## Version source

`merge-tonic-lib/pyproject.toml`

## Repo links

- Monorepo source: **`merge-tonic-lib/`**
- Package README: **`merge-tonic-lib/README.md`**

## Known caveats

- Python and TypeScript parity is validated in CI; local parity needs both toolchains.
- Hydration with Chroma or remote embeddings pulls in optional dependencies and env configuration — see [[Hydration-Pipeline]].
