# @mergetonic/core

TypeScript implementation of the Tonic CRDT weave merge engine (parity-tested against the Python package in `merge-tonic-lib/`).

## Canonical docs

- Component docs: `https://github.com/mergetonic/common/wiki/Core-TS-%40mergetonic-core`
- Wiki home: `https://github.com/mergetonic/common/wiki`

## API

- `initialState`, `currentLines`, `updateState`, `mergeStates`
- `mergeSnapshots`, `annotatedToConflictFile`, `heuristicResolvedLines`, `applyTonicResolutions`, `applyTonicHeuristic`, `parseTonicConflicts`
- CLI binary `merge-tonic`: `merge`, `apply`, `conflicts`, `report`, `git …` (`compare`, `materialize`, `from-index`, `merge`, `worktree`, `fetch`), `github ref create` — parity with Python `tonic` package; invoke via `npx --yes @mergetonic/core merge-tonic merge --left … --right …` or `npx --package=@mergetonic/core merge-tonic …`
- Optional blame metadata in JSON/report flows: `report --blame --left-commit-id <sha> --right-commit-id <sha>` and `git compare --blame [--blame-max-commits <n>]`.
- Shorthand support: top-level aliases (`m`,`a`,`c`,`r`,`g`), git aliases (`f`,`mat`,`fi`,`m`,`wt`), common short flags, and positional marker-optional forms like `merge-tonic r left.txt right.txt` and `merge-tonic a conflicted.txt`
- Repo-oriented commands and safety flags: [docs/cli-repo-commands.md](../../docs/cli-repo-commands.md)

## Hydration optional AI contract

- Optional dependency group name: `ai` (cross-runtime contract).
- Pinned npm package for Chroma-backed hydration paths: `chromadb@0.5.23`.
- Missing optional AI dependencies should use skip semantics (`hydration_skipped=true`, `skip_reason=missing_optional_ai_dependencies`, exit code `5` for machine callers).
- Current TS runtime support: `TONIC_CHROMA_MODE=http` (Chroma HTTP) and `TONIC_CHROMA_MODE=memory`.
- Probe contract command: `merge-tonic git hydrate-intents --check-optional-ai --out-json <path>`.

See [docs/hydration-chroma-runtime.md](../../docs/hydration-chroma-runtime.md).

## Usage

```typescript
import { mergeSnapshots, parseTonicConflicts } from "@mergetonic/core";

const [mergedLines, annotated] = mergeSnapshots(left, right);
```

## Develop

From monorepo root:

```bash
pip install -e "./merge-tonic-lib[dev]"
npm ci
npm run test -w @mergetonic/core
```

Parity tests call `merge-tonic-lib/tests/parity_gate.py` with `PYTHONPATH` set to `merge-tonic-lib`.

## License

Unlicense (match `merge-tonic-lib`).
