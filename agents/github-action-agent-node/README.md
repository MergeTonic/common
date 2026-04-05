# Tonic GitHub Action Agent (Node)

## Canonical docs

- Component docs: `https://github.com/mergetonic/common/wiki/GitHub-Agent-Node`
- Wiki home: `https://github.com/mergetonic/common/wiki`

**Publishable unit:** this composite [`action.yml`](./action.yml) installs **`@mergetonic/core`** and runs the same PR pipeline as the Python agent. Default `merge_engine=git` performs isolated `git merge --no-commit` hydration, writes **merge-tonic-report** JSON, creates a fresh run branch/PR, then publishes summary/file/inline/check outputs to the created PR context. Optional `merge_engine=api` keeps compare/contents hydration and publishes to the source event PR context.

On **`issue_comment`**, the composite resolves `TONIC_TARGET_*` via `gh api …/pulls/{issue.number}` and sets **`TONIC_PULL_REQUEST_JSON`**; the agent loads that JSON when the webhook has no top-level `pull_request`. Use **`merge_engine: api`** on comment-triggered workflows if you want comments on the same PR (see [`.github/workflows/tonic-pr-agent-comment.yml`](../../.github/workflows/tonic-pr-agent-comment.yml)).

## Parity with Python

| Feature | Node agent |
| ------- | ---------- |
| Merge report + `annotated_lines` for marker files | Yes |
| Deterministic prefer-head inline body | Yes |
| `INPUT_ENABLE_AI` + shared prompt bundle + OpenAI stack | Yes (`src/buildOpenAiStack.ts`, `src/promptEngineering.ts`) |
| Prompt templates + disk cache + retries (Python parity) | Yes (`TONIC_AGENT_PROMPT_TEMPLATE`, `TONIC_AGENT_USE_CACHE`, `TONIC_AGENT_USE_RETRIES`, …) |
| PR labels in AI prompts (`author_alias_*` / `github_login_*`) | Yes (`src/conflictLabels.ts`) |
| `INPUT_ENABLE_CHECKS` | Yes (`src/githubChecks.ts`) |
| Sequential head-span disambiguation | Yes (`preferAfterLine0` in `headLineMap.ts`) |
| Marker branch (`tonic/pr-…`) | Yes (`src/markerBranch.ts`) |
| Orphan inline comments + UTF-8 chunking | Yes (`githubComments.ts`, `commentChunking.ts`) |
| `in_reply_to` on review comments | Supported in `postPullReviewComment` opts |
| Optional blame metadata (`INPUT_ENABLE_BLAME`) | Yes |

## Inputs

See `action.yml`. Notable: `report_path` for VS Code **Import merge report**, `enable_ai` / `enable_checks`, and `merge_engine` (`git` default, `api` optional fallback). For `merge_engine=git`, optional **`author_mode`**, **`author_alias_left`/`author_alias_right`**, **`intent_pair`**, and **`github_login_*`** hydrate Tonic markers with author/intent tags (parity with Python and `@mergetonic/core`).

When `merge_engine=git`, the runtime requires immutable refs from action bootstrap (`TONIC_TARGET_*`) and an isolated workspace (`TONIC_AGENT_ISOLATED_WORKSPACE`). When `merge_engine=api`, `hydrate_mode` controls API hydration (`pr-diff`/`symmetric-union`) and publishing stays on the source PR.

## Environment variables (AI / `TONIC_AGENT_*`)

Prompt text is loaded from the vendored bundle (kept in sync with the Python agent via `scripts/sync_agent_ai_prompts.py`). Optional overrides:

| Variable | Purpose |
| -------- | ------- |
| `TONIC_AGENT_SYSTEM_PROMPT` | Override system prompt |
| `TONIC_AGENT_PROMPT_TEMPLATE` | `default`, `enhanced` (default when unset), `context-aware` |
| `TONIC_AGENT_OPENAI_API_KEY` | API key |
| `TONIC_AGENT_OPENAI_BASE_URL` | OpenAI-compatible base URL |
| `TONIC_AGENT_OPENAI_MODEL` | Model id |
| `TONIC_AGENT_TIMEOUT` | HTTP timeout (seconds) |
| `TONIC_AGENT_USE_CACHE` | `true`/`false` — disk cache for conflict resolutions (default on) |
| `TONIC_AGENT_CACHE_DIR` | Cache directory (default `.tonic_agent_cache` under cwd) |
| `TONIC_AGENT_CACHE_TTL_HOURS` | TTL for cache entries |
| `TONIC_AGENT_USE_RETRIES` | Retry on retryable errors (default on) |
| `TONIC_AGENT_MAX_RETRIES` | Max retries |
| `TONIC_AGENT_INITIAL_BACKOFF_MS` | Backoff tuning |
| `TONIC_AGENT_MAX_BACKOFF_MS` | Backoff cap |
| `TONIC_AGENT_BACKOFF_MULTIPLIER` | Exponential factor |
| `TONIC_AGENT_JITTER_FACTOR` | Jitter on backoff |

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

## Hydration retrieval / Chroma

The Node agent runs the same hydrate pipeline as Python when **`ast_hydration_subcommand`** is **`hydrate`**. Retrieval is **off** unless you pass **`--enable-retrieval`** in **`ast_hydration_extra_args`** (or use `@tonicmerge` tokens parsed by [`.github/workflows/tonic-pr-agent-comment.yml`](../../.github/workflows/tonic-pr-agent-comment.yml)).

- **Memory backend (default for `--enable-retrieval`):** no Chroma URL; histogram embeddings by default.
- **Optional memory vector cache:** **`TONIC_VECTOR_CACHE_PATH`** / **`TONIC_VECTOR_CACHE_MODE`** or **`ast_hydration_extra_args`** with **`--vector-cache-path`** / **`--vector-cache-mode`** (see **`docs/retrieval-hydration.md`**).
- **Chroma:** set **`TONIC_CHROMA_URL`** (and optional collection / embedding vars). Use job/step **`env:`** or action inputs **`tonic_chroma_url`**, **`tonic_chroma_collection`**, **`tonic_retrieval_backend`**, **`tonic_embedding_base_url`**, **`tonic_embedding_backend`**.

Canonical env table: **[`docs/retrieval-hydration.md`](../../docs/retrieval-hydration.md)**. Optional gated PR jobs with a Chroma **service** container use repo variable **`TONIC_PR_AGENT_CHROMA_SERVICE`**; see that doc.

**Precedence:** **`TONIC_RETRIEVAL_BACKEND`** in the environment overrides CLI **`--retrieval-backend`** (aligned with `merge-tonic` Python).

## Troubleshooting: ast-grep hydration

If `INPUT_ENABLE_AST_HYDRATION` is `true` and hydrate exits **10** (`sg` not found), ensure the runner has the CLI. The composite action installs **`@ast-grep/cli`** globally (`ast_grep_version` input, default `0.39.0`) before the agent runs. For local runs, install the same (`npm i -g @ast-grep/cli`) or set `TONIC_AST_GREP_BIN` to your `sg` executable.

## Tests

```bash
npm run test -w @mergetonic/github-agent
```
