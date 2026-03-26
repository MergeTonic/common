# Tonic GitHub Action Agent

## Canonical docs

- Component docs: `https://github.com/mergetonic/common/wiki/GitHub-Agent-Python`
- Wiki home: `https://github.com/mergetonic/common/wiki`

## Node / TypeScript runtime (default for new installs)

The composite action **[`agents/github-action-agent-node/action.yml`](../github-action-agent-node/action.yml)** mirrors this Python agent on **`pull_request`**: hydrates base/head via the GitHub API, runs **`@mergetonic/core`**, upserts summary + per-file issue comments, posts **inline review comments** with unified diff + optional **GitHub “Commit suggestion”** blocks (heuristic resolution; optional AI is reserved). Writes the same **`merge-tonic-report`** JSON when `report_path` / `TONIC_AGENT_REPORT_PATH` is set. Use it when you want a Node 20 environment without `pip`.

```yaml
- uses: ./agents/github-action-agent-node
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
```

## Python agent (this package)

On **`pull_request` events**, hydrates **left = base SHA** and **right = head SHA** for each changed file (GitHub compare API), runs Tonic `merge_states` on the two snapshots, and posts:

- One **summary** issue comment (upserted via `<!-- tonic-agent:summary` marker)
- Per-file issue comments when there are conflict markers (upserted via `<!-- tonic-agent:file:{path}:`)
- Optional **inline** pull review comments on the head (`RIGHT`) file: Tonic marker excerpts (UTF-8–chunked for GitHub size limits), **unified diff** (`-` / `+`), and a fenced **suggestion** block when the proposed hunk matches the anchored line span (multiline comments use `start_line` / `line` on the REST API). Deduped by hidden markers.
- **Marker branch:** when any file has `markers_present`, the agent pushes `refs/heads/tonic/pr-<n>-<shortsha>-<run>` from the PR **head** commit, replacing only those paths with full Tonic `annotated` text (requires `contents: write` on the token).
- **Orphan regions:** if a conflict cannot be uniquely mapped to head lines, a review comment is still posted anchored at **line 1** (`<!-- tonic-agent:orphan-inline:… -->`) with the full marker region and pointers to the marker branch / artifact.

Hydration uses the Contents API with **download_url** and **git blobs** fallbacks for large files. Optional AI (`INPUT_ENABLE_AI`) returns JSON `resolved_lines` for inline suggestions when the model obeys the contract; otherwise a **head-first heuristic** is used.

This is **not** Git's three-way merge: it is Tonic's deterministic two-snapshot weave (see the repository root README).

If there is **no** `pull_request` in `GITHUB_EVENT_PATH` (local run), the agent falls back to a small demo merge so `python -m tonic_agent` still prints output.

**JSON report:** set env `TONIC_AGENT_REPORT_PATH=merge-tonic-report.json` (or action input `report_path`) to write [`schemas/merge-tonic-report.schema.json`](../../schemas/merge-tonic-report.schema.json)-shaped output for the VS Code command *Tonic: Import merge report JSON*. Files with `markers_present` **always** include `annotated_lines` in that JSON (so the extension can open them without `verbosity: high` on the PR summary).

**PR summary vs. artifact:** the issue-comment JSON still only embeds per-file `annotated_lines` when `verbosity: high`. The **artifact file** is what operators should download for the extension at `medium` verbosity.

**Inline review:** unique head spans use normal inline threads. **Ambiguous** or **unmapped** regions get **orphan** review comments (anchored at line 1) instead of being dropped. Sequential conflicts use `prefer_after_line_0` to reduce duplicates. **Whole-file** right hunks map deterministically when the hunk equals the entire head file.

**Checks:** set input `enable_checks: true` (and grant `checks: write` on the token) to post a **GitHub Check** with annotations alongside PR comments.

| Input / env | Purpose |
|-------------|---------|
| `INPUT_HYDRATE_MODE` / default `pr-diff` | `pr-diff` uses compare commits; `symmetric-union` unions recursive git trees (heavier) |
| `INPUT_ENABLE_AI` | When `true`, uses AI for inline JSON `resolved_lines` (+ file-comment notes) when API keys are set |
| `INPUT_ENABLE_CHECKS` | When `true`, posts a GitHub Check run with annotations (needs `checks: write`) |
| `INPUT_ENABLE_BLAME` | When `true`, include optional blame metadata (`left_commit_ids`/`right_commit_ids`) in report and inline summaries |
| `INPUT_BLAME_MAX_COMMITS` | Max blame commit ids per side in emitted metadata (default `3`) |
| `INPUT_MAX_SUGGESTION_LINES` | Cap on lines per suggestion block (default `200`; use `0` for uncapped — still subject to GitHub API limits) |
| `TONIC_AGENT_MAX_FILES` | Cap files merged (default `200`) |
| `TONIC_AGENT_REPORT_PATH` | Write full merge report JSON |

**Manual acceptance:** on a PR with a text conflict, inline threads should show marker excerpts + diff; *Commit suggestion* should apply cleanly on the **RIGHT** side when line counts match. Fork PRs may lack token permissions for review comments. **`pull-requests: write`** is required for inline suggestions.

## Environment variables (TONIC_AGENT_*)

| Tonic | Legacy fallback env | Purpose |
|--------|-------------------|---------|
| `TONIC_AGENT_SYSTEM_PROMPT` | `RIZZLER_SYSTEM_PROMPT` | Override system prompt |
| `TONIC_AGENT_PROMPT_TEMPLATE` | `RIZZLER_PROMPT_TEMPLATE` | `default`, `enhanced`, `context-aware` |
| `TONIC_AGENT_OPENAI_API_KEY` | `RIZZLER_OPENAI_API_KEY` | API key |
| `TONIC_AGENT_OPENAI_BASE_URL` | `RIZZLER_OPENAI_BASE_URL` | OpenAI-compatible base URL |
| `TONIC_AGENT_OPENAI_MODEL` | `RIZZLER_OPENAI_MODEL` | Model id |
| `TONIC_AGENT_TIMEOUT` | `RIZZLER_TIMEOUT` | HTTP timeout (seconds) |
| `TONIC_AGENT_USE_CACHE` | `RIZZLER_USE_CACHE` | `true`/`false` |
| `TONIC_AGENT_CACHE_DIR` | `RIZZLER_CACHE_DIR` | Disk cache directory |
| `TONIC_AGENT_CACHE_TTL_HOURS` | `RIZZLER_CACHE_TTL_HOURS` | Cache TTL |
| `TONIC_AGENT_USE_RETRIES` | `RIZZLER_USE_RETRIES` | Enable retry wrapper |
| `TONIC_AGENT_MAX_RETRIES` | `RIZZLER_MAX_RETRIES` | Max retries |
| `TONIC_AGENT_FALLBACK_ORDER` | `RIZZLER_FALLBACK_ORDER` | Comma-separated providers (extensible) |
| `TONIC_AGENT_TOKEN_LIMIT` | `RIZZLER_TOKEN_LIMIT` | Windowing token estimate threshold |
| `TONIC_AGENT_MAX_CONTEXT_LINES` | `RIZZLER_MAX_CONTEXT_LINES` | Surrounding context |

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
