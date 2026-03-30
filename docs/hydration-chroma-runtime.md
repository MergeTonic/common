# Hydration Chroma Runtime Contract

This document defines the pinned Chroma contract used by hydration scaffolding and release checks.

## Pinned versions

- Chroma server image: `chromadb/chroma:0.5.23`
- Python package pin: `chromadb==0.5.23`
- npm package pin: `chromadb@0.5.23`
- Heartbeat readiness endpoint: `/api/v2/heartbeat`

Machine-readable source: `docs/hydration-chroma-version-pins.json`.

## Readiness gate

Before invoking hydration CLI paths that use Chroma over HTTP:

1. Start job-local Chroma with the pinned image tag.
2. Wait for `GET /api/v2/heartbeat` to return success.
3. Only then invoke hydration commands.

## Persist writer safety

- Use exactly one writer per persist path (`TONIC_CHROMA_PERSIST_PATH`) at a time.
- Do not run concurrent writers against the same path (`merge-tonic` CLI + `chroma run`, or VS Code + CLI) unless one path is read-only and explicitly isolated.
- The hydration runtime enforces a writer lock (`.writer.lock`) and validates `persist-manifest.json` + `index-state.json` before reuse.

## Optional dependency group

- Optional dependency group name: `ai`
- Missing optional AI dependencies should not crash orchestration.
- Contracted skip behavior for hydration callers:
  - emit `hydration_skipped=true`
  - set `skip_reason=missing_optional_ai_dependencies`
  - use exit code `5` when a machine-step is requested (for downstream conditional handling).
