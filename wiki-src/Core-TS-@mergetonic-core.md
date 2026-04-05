# Core TS: @mergetonic/core

## What it is

TypeScript implementation of the deterministic Tonic weave merge engine, Git helpers, hydration pipeline, and ast-grep integration. Ships **`hydration-prompts`** and depends on **`@mergetonic/coding-hydration`** and **`@mergetonic/hf-weave`** for hydrate/weave features.

## Install

```bash
npm install @mergetonic/core
```

## Version source

`packages/tonic-core/package.json`

## Repo links

- Monorepo source: **`packages/tonic-core/`**
- Package README: **`packages/tonic-core/README.md`**

## Known caveats

- CLI parity tests may assume the Python package layout when running the full matrix locally.
- Retrieval and code-walk agent paths need the same embedding / LLM env as documented on [[Hydration-Pipeline]].
