# Hydration pipeline

Both **`@mergetonic/core`** and **`mergetonic`** implement the same hydration surfaces: ast-grep evidence, multi-phase LLM refinement, optional dense retrieval, and optional code-walk tooling.

## Entry points

| Command | Alias | Role |
|---------|-------|------|
| `merge-tonic ast-grep-hydrate` | `agh` | Run `sg scan`, emit `tonic-ast-hydration.v1` and `tonic-hydration-run.v1` |
| `merge-tonic hydrate` | `h` | Full pipeline: conflicts → intent bootstrap → structure → ast → question refinement → retrieval → code-walk → intent bundle (see `--phase` to stop early) |
| `merge-tonic git hydrate-intents` | — | Interactive profile or ast-grep passthrough (`--ast-grep-*`, `--rule`, …) |

Python: `python -m tonic.cli …` or the `merge-tonic` / `mergetonic` console scripts with the same subcommand names.

## Shared exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 10 | ast-grep binary (`sg`) not found |
| 11 | Invalid arguments / config |
| 12 | Scan execution failure |
| 13 | Partial success (warnings, truncation, skipped stages) |

## JSON artifacts and schemas

Normative definitions live under `schemas/` in the monorepo. Common artifacts:

| Artifact | Schema file | `schema` const |
|----------|-------------|----------------|
| AST evidence | `tonic-ast-hydration.v1.json` | `tonic-ast-hydration` |
| Run envelope | `tonic-hydration-run.v1.json` | `tonic-hydration-run` |
| Intent bootstrap | `tonic-hydration-intent-bootstrap.v1.json` | `tonic-hydration-intent-bootstrap` |
| Conflict context | `tonic-conflict-context.v1.json` | `tonic-conflict-context` |
| Question refinement | `tonic-question-refinement.v1.json` | `tonic-question-refinement` |
| Intent bundle | `tonic-intent-hydration.v1.json` | `tonic-intent-hydration` |
| Retrieval | `tonic-retrieval-hydration.v1.json` | `tonic-retrieval-hydration` |
| Code-walk trace | `tonic-code-walk-trace.v1.json` | `tonic-code-walk-trace` |

**Determinism conventions:** repo-relative paths use `/`; match sort order is `(path, start.line, start.column, rule_id)` ascending; truncation and warnings are recorded on the run envelope.

Hydration **does not** replace `merge-tonic report`. Agents may attach ast/run paths next to merge report JSON.

## Retrieval (summary)

- Default backend is **in-memory** vectors built from ast-grep match spans (`@mergetonic/coding-hydration` in TypeScript, `tonic.hydration` in Python).
- Optional **Chroma HTTP**: `--retrieval-backend chroma` and `TONIC_CHROMA_URL` (and collection via `TONIC_CHROMA_COLLECTION`).
- Embeddings: deterministic **histogram** by default, or OpenAI-compatible / HF inference when configured (`TONIC_EMBEDDING_BACKEND`, `TONIC_EMBEDDING_BASE_URL`, `HF_TOKEN`, etc.).
- If `TONIC_RETRIEVAL_BACKEND` is set in the environment, it overrides the CLI `--retrieval-backend` flag in both runtimes.

## Implementation layout

- TypeScript: `packages/tonic-core/src/hydration/`, `packages/tonic-core/src/astGrep/`, dependency `packages/tonic-coding-hydration/`.
- Python: `merge-tonic-lib/tonic/hydration_pipeline.py`, `tonic/ast_grep_hydrate.py`, packaged rules under `tonic/data/ast_grep_rules/`.

For flag-level detail (phases, conflict gate, prior-run chaining, GitHub Action `INPUT_*` mapping), use **`merge-tonic hydrate --help`** / **`merge-tonic ast-grep-hydrate --help`** in a checkout; they track the implementation.
