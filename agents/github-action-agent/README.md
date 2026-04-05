# Tonic GitHub Action Agent

## Canonical docs

- Component docs: `https://github.com/mergetonic/common/wiki/GitHub-Agent-Python`
- Wiki home: `https://github.com/mergetonic/common/wiki`

## Node / TypeScript runtime (default for new installs)

The composite action **[`agents/github-action-agent-node/action.yml`](../github-action-agent-node/action.yml)** mirrors this Python agent on **`pull_request`**. Default `merge_engine=git` performs isolated git-merge hydration in a temporary workspace, creates a fresh run branch/PR, and publishes outputs to that run PR context. Optional `merge_engine=api` keeps compare/contents hydration and publishes to the source event PR context.

```yaml
- uses: ./agents/github-action-agent-node
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```

## Python agent (this package)

On **`issue_comment`** (for example the workflow [`.github/workflows/tonic-pr-agent-comment.yml`](../../.github/workflows/tonic-pr-agent-comment.yml)), the composite action resolves the PR with `gh api …/pulls/{issue.number}`, exports `TONIC_TARGET_*` and `TONIC_PULL_REQUEST_JSON`, and the agent loads that pull JSON when `pull_request` is missing from the webhook. The dogfood comment workflow uses **`merge_engine: api`** so summary and review comments stay on the **same PR** the user commented on (unlike `merge_engine=git`, which opens a separate isolated run PR).

On **`pull_request` events**, the default path (`merge_engine=git`) hydrates conflicts from isolated `git merge --no-commit`, then posts:

- One **summary** issue comment (upserted via `<!-- tonic-agent:summary` marker)
- Per-file issue comments when there are conflict markers (upserted via `<!-- tonic-agent:file:{path}:`)
- Optional **inline** pull review comments on the head (`RIGHT`) file: Tonic marker excerpts (UTF-8–chunked for GitHub size limits), **unified diff** (`-` / `+`), and a fenced **suggestion** block when the proposed hunk matches the anchored line span (multiline comments use `start_line` / `line` on the REST API). Deduped by hidden markers.
- **Marker branch:** when any file has `markers_present`, the agent pushes `refs/heads/tonic/pr-<n>-<shortsha>-<run>` from the PR **head** commit, replacing only those paths with full Tonic `annotated` text (requires `contents: write` on the token).
- **Orphan regions:** if a conflict cannot be uniquely mapped to head lines, a review comment is still posted anchored at **line 1** (`<!-- tonic-agent:orphan-inline:… -->`) with the full marker region and pointers to the marker branch / artifact.

Hydration uses the Contents API with **download_url** and **git blobs** fallbacks for large files. Optional AI (`INPUT_ENABLE_AI`) returns JSON `resolved_lines` for inline suggestions when the model obeys the contract; otherwise a **head-first heuristic** is used.

In `merge_engine=api`, hydration falls back to compare/contents API snapshots and Tonic's deterministic two-snapshot weave (see the repository root README).

If there is **no** `pull_request` in `GITHUB_EVENT_PATH` (local run), the agent falls back to a small demo merge so `python -m tonic_agent` still prints output.

**JSON report:** set env `TONIC_AGENT_REPORT_PATH=merge-tonic-report.json` (or action input `report_path`) to write [`schemas/merge-tonic-report.schema.json`](../../schemas/merge-tonic-report.schema.json)-shaped output for the VS Code command *Tonic: Import merge report JSON*. Files with `markers_present` **always** include `annotated_lines` in that JSON (so the extension can open them without `verbosity: high` on the PR summary).

**PR summary vs. artifact:** the issue-comment JSON still only embeds per-file `annotated_lines` when `verbosity: high`. The **artifact file** is what operators should download for the extension at `medium` verbosity.

**Inline review:** unique head spans use normal inline threads. **Ambiguous** or **unmapped** regions get **orphan** review comments (anchored at line 1) instead of being dropped. Sequential conflicts use `prefer_after_line_0` to reduce duplicates. **Whole-file** right hunks map deterministically when the hunk equals the entire head file.

**Checks:** set input `enable_checks: true` (and grant `checks: write` on the token) to post a **GitHub Check** with annotations alongside PR comments.

| Input / env | Purpose |
| ----------- | ------- |
| `INPUT_HYDRATE_MODE` / default `pr-diff` | `pr-diff` uses compare commits; `symmetric-union` unions recursive git trees (heavier) |
| `INPUT_MERGE_ENGINE` / default `git` | `git` performs isolated `git merge --no-commit`, requires immutable `TONIC_TARGET_*` refs, creates a new run PR, and publishes to that new PR context; `api` keeps compare+snapshot weave |
| `INPUT_ENABLE_AI` | When `true`, uses AI for inline JSON `resolved_lines` (+ file-comment notes) when API keys are set |
| `INPUT_ENABLE_CHECKS` | When `true`, posts a GitHub Check run with annotations (needs `checks: write`) |
| `INPUT_ENABLE_BLAME` | When `true`, include optional blame metadata (`left_commit_ids`/`right_commit_ids`) in report and inline summaries |
| `INPUT_BLAME_MAX_COMMITS` | Max blame commit ids per side in emitted metadata (default `3`) |
| `INPUT_MAX_SUGGESTION_LINES` | Cap on lines per suggestion block (default `200`; use `0` for uncapped — still subject to GitHub API limits) |
| `INPUT_AUTHOR_MODE` | Git-merge hydration: `base-head` (default), `human`, or `ref` |
| `INPUT_AUTHOR_ALIAS_LEFT` / `INPUT_AUTHOR_ALIAS_RIGHT` | Optional explicit author tags on Tonic markers |
| `INPUT_INTENT_PAIR` | Optional `left,right` intent tags (defaults `preserve_base,prefer_head`) |
| `INPUT_HYDRATION_QUESTION_MODE` | When `ast_hydration_subcommand` is `hydrate`: `off` (default), `on`, or `auto` for `--question-mode` |
| `TONIC_PULL_REQUEST_JSON` | Path to a pull JSON file (set by the composite action on `issue_comment`) |
| `INPUT_GITHUB_LOGIN_LEFT` / `INPUT_GITHUB_LOGIN_RIGHT` | Optional GitHub logins for author tags |
| `TONIC_AGENT_MAX_FILES` | Cap files merged (default `200`) |
| `TONIC_AGENT_REPORT_PATH` | Write full merge report JSON |

**Manual acceptance:** on a PR with a text conflict, inline threads should show marker excerpts + diff; *Commit suggestion* should apply cleanly on the **RIGHT** side when line counts match. Fork PRs may lack token permissions for review comments. **`pull-requests: write`** is required for inline suggestions, and **`contents: write`** is required for run-branch push/new-PR orchestration.

## Environment variables (TONIC_AGENT_*)

| Variable | Purpose |
| -------- | ------- |
| `TONIC_AGENT_SYSTEM_PROMPT` | Override system prompt |
| `TONIC_AGENT_PROMPT_TEMPLATE` | `default`, `enhanced`, `context-aware` |
| `TONIC_AGENT_OPENAI_API_KEY` | API key |
| `TONIC_AGENT_OPENAI_BASE_URL` | OpenAI-compatible base URL |
| `TONIC_AGENT_OPENAI_MODEL` | Model id |
| `TONIC_AGENT_TIMEOUT` | HTTP timeout (seconds) |
| `TONIC_AGENT_USE_CACHE` | `true`/`false` |
| `TONIC_AGENT_CACHE_DIR` | Disk cache directory |
| `TONIC_AGENT_CACHE_TTL_HOURS` | Cache TTL |
| `TONIC_AGENT_USE_RETRIES` | Enable retry wrapper |
| `TONIC_AGENT_MAX_RETRIES` | Max retries |
| `TONIC_AGENT_FALLBACK_ORDER` | Comma-separated providers (extensible) |
| `TONIC_AGENT_TOKEN_LIMIT` | Windowing token estimate threshold |
| `TONIC_AGENT_MAX_CONTEXT_LINES` | Surrounding context |

## Hydration retrieval / Chroma

Batch retrieval during the **`hydrate`** subcommand (`ast_hydration_subcommand: hydrate`) is **off** unless you pass `--enable-retrieval` via `ast_hydration_extra_args` or enable it from an `@tonicmerge` comment (see [`.github/workflows/tonic-pr-agent-comment.yml`](../../.github/workflows/tonic-pr-agent-comment.yml)).

- **`--enable-retrieval` without `--retrieval-backend`** uses the **in-memory** vector index (histogram embeddings by default). No Chroma URL or extra secrets are required.
- **Optional embedding cache (memory backend):** pass **`--vector-cache-path`** / **`--vector-cache-mode`** in **`ast_hydration_extra_args`**, or set **`TONIC_VECTOR_CACHE_PATH`** and **`TONIC_VECTOR_CACHE_MODE`** in **`env:`**, to persist and reload chunk embeddings across runs (see **`docs/retrieval-hydration.md`**).
- **`--retrieval-backend chroma`** needs a reachable Chroma HTTP API. Set **`TONIC_CHROMA_URL`** (and optionally **`TONIC_CHROMA_COLLECTION`**). You can set these via job or step **`env:`**, or use the composite inputs **`tonic_chroma_url`**, **`tonic_chroma_collection`**, **`tonic_retrieval_backend`**, **`tonic_embedding_base_url`**, **`tonic_embedding_backend`** (forwarded to the same-named environment variables on the agent step).

Full variable table and hybrid flags: **[`docs/retrieval-hydration.md`](../../docs/retrieval-hydration.md)**.

**Example (step `env:` + extra args):**

```yaml
- uses: ./agents/github-action-agent
  with:
    enable_ast_hydration: true
    ast_hydration_subcommand: hydrate
    ast_hydration_extra_args: --enable-retrieval --retrieval-backend chroma
  env:
    TONIC_CHROMA_URL: http://127.0.0.1:8000
    TONIC_RETRIEVAL_BACKEND: chroma
```

Optional PR workflows can start a local Chroma service when the repo variable **`TONIC_PR_AGENT_CHROMA_SERVICE`** is `true`; see **`docs/retrieval-hydration.md`** (PR agent workflows).

**Precedence:** If **`TONIC_RETRIEVAL_BACKEND`** is set in the environment, it overrides the CLI `--retrieval-backend` value (same as `merge-tonic` Python). To drive the backend only from the CLI, omit **`TONIC_RETRIEVAL_BACKEND`** from `env`.

## Troubleshooting: ast-grep hydration

With `enable_ast_hydration: true`, exit code **10** means `sg` was not found. The composite action installs **`@ast-grep/cli`** via npm (`ast_grep_version`, default `0.39.0`) when hydration is enabled. Locally, install the CLI or set `TONIC_AST_GREP_BIN`.

## Published install (PyPI)

```bash
pip install "tonic==0.1.0" "mergetonic-github-agent==0.1.0"
python -m tonic_agent
```

(`uvx --from mergetonic-github-agent tonic-agent` once both packages are on PyPI.)

## Local install (monorepo)

```bash
pip install -e ../../merge-tonic-lib
pip install -e .
python -m tonic_agent
```

## Tests

```bash
pytest tests/ -v
```
