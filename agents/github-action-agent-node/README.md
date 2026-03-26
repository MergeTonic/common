# Tonic GitHub Action Agent (Node)

## Canonical docs

- Component docs: `https://github.com/mergetonic/common/wiki/GitHub-Agent-Node`
- Wiki home: `https://github.com/mergetonic/common/wiki`

**Publishable unit:** this composite [`action.yml`](./action.yml) installs **`@mergetonic/core`** (parser + `mergeSnapshots` / `annotatedToConflictFile`) and runs the same PR pipeline as the Python agent: hydrate base/head via the GitHub API, write **merge-tonic-report** JSON, upsert **summary** + **per-file** issue comments, and post **inline** review threads with unified diff + GitHub **suggestion** blocks when the resolved hunk matches the anchored span.

## Parity with Python

| Feature | Node agent |
|--------|------------|
| Merge report + `annotated_lines` for marker files | Yes |
| Deterministic prefer-head inline body | Yes |
| `INPUT_ENABLE_AI` + `TONIC_AGENT_OPENAI_*` | Yes (`src/aiResolve.ts`) |
| `INPUT_ENABLE_CHECKS` | Yes (`src/githubChecks.ts`) |
| Sequential head-span disambiguation | Yes (`preferAfterLine0` in `headLineMap.ts`) |
| Marker branch (`tonic/pr-…`) | Yes (`src/markerBranch.ts`) |
| Orphan inline comments + UTF-8 chunking | Yes (`githubComments.ts`, `commentChunking.ts`) |
| `in_reply_to` on review comments | Supported in `postPullReviewComment` opts |
| Optional blame metadata (`INPUT_ENABLE_BLAME`) | Yes |

## Inputs

See `action.yml`. Notable: `report_path` for VS Code **Import merge report**, `enable_ai` / `enable_checks`.

## Local run

```bash
cd ../..
npm ci
npm run build -w @mergetonic/core
node agents/github-action-agent-node/dist/index.js
```

With a GitHub event file and token, set `GITHUB_EVENT_PATH`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, etc., matching GitHub Actions.

## Published install (npm)

```bash
npx --yes @mergetonic/github-agent@0.1.0
```

The package binary runs the same entry as `node dist/index.js` after a monorepo build.

## Tests

```bash
npm run test -w @mergetonic/github-agent
```
