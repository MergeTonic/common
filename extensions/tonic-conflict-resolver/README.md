# Tonic Conflict Resolver (VS Code / Cursor)

Highlights **Tonic** conflict markers (`<<<<<<< begin …`, `======= begin …`, `>>>>>>> end conflict`), provides **CodeLens** actions, a **Conflicts** tree view, and commands for deterministic merge and CI import.

## Deterministic resolution (same semantics as the PR agent heuristic)

- **Keep Right** (CodeLens) / **Tonic: Keep Right** — matches the GitHub agent’s **prefer-head** inline suggestion (`heuristic_resolved_lines`): keep the **right (head)** hunk when both sides exist.
- **Keep Left** — keep the **base** hunk.
- **Keep Both** — concatenate side contents (ordered segments).
- **Resolve with AI** — copies a hydrated prompt for Cursor / VS Code chat.
- After resolving, **save** the document and commit via the built-in **Source Control** view (the extension does not run `git commit`).

## CI merge report import

**Tonic: Import merge report JSON** reads [`merge-tonic-report`](../../schemas/merge-tonic-report.schema.json) shaped JSON from the Python or Node GitHub agent. Files with `markers_present` include `annotated_lines` in current agents. **Legacy reports** without `annotated_lines` but with `conflict_regions` can be opened via **reconstructed** markers (`conflictRegionsToAnnotatedLines` in `@mergetonic/core`). Reports may include **`marker_branch`** / **`marker_paths`** when the agent pushed a snapshot branch.
When report artifacts include optional blame metadata (`left_commit_id` / `right_commit_id`, or region-level commit id arrays), the import picker surfaces a compact blame summary.

**Tonic: Apply merge report markers to workspace file** writes `annotated_lines` (or reconstructed markers) to the workspace path from the report, with a `.tonic.bak` backup when the file already exists.

Settings: **`tonic.defaultReportGlob`** — hint for artifact location. The importer can **Re-open last report file** per workspace.

**Git-merge reconstruction defaults** (when opening legacy reports that only have `conflict_regions` without `annotated_lines`): **`tonic.gitMergeIntent.leftDefault`** / **`tonic.gitMergeIntent.rightDefault`** fill missing intent tags; **`tonic.gitMergeAuthor.leftDefault`** / **`tonic.gitMergeAuthor.rightDefault`** optionally override author tags (otherwise `base` / `head`). **`tonic.gitMergeAuthor.preferHumanAlias`** is reserved for future use.

## Semantic highlight configuration (JSON)

Semantic highlighting can now be driven by conflict labels/tags.

- `tonic.highlight.enableSemantic` toggles semantic highlight mode.
- `tonic.highlight.defaultPalette` selects a default preset (`tonic` or `contrast`).
- `tonic.conflictLabelConfig` adds optional custom JSON rules.

Example:

```json
{
  "tonic.highlight.enableSemantic": true,
  "tonic.highlight.defaultPalette": "tonic",
  "tonic.conflictLabelConfig": {
    "rules": [
      {
        "kind": "added right",
        "tags": { "intent": "security" },
        "backgroundColor": "#ffd1d1"
      }
    ]
  }
}
```

## Git conflict markers

**Tonic: Preview Git conflicts as Tonic markers** opens a new buffer with a Tonic-style preview from standard `<<<<<<<` / `=======` / `>>>>>>>` markers (read-only workflow). Diagnostics also surface **Git** and **Tonic** marker warnings on open/save.

## Resolve with AI (Cursor / Chat)

**Tonic: Resolve with AI** copies a **hydrated** prompt (workspace-relative path, left/right hunks, optional last-imported `base_sha` / `head_sha` / refs) plus JSON output instructions aligned with the agent’s `parse_resolved_lines_from_ai` contract. Paste into **Cursor Chat** or VS Code Chat.

Commands also include **Tonic: Jump to line** (`tonic.jumpToLine`) for programmatic navigation.

Parser and merge logic come from [`@mergetonic/core`](../../packages/tonic-core/); the published extension bundles that code with esbuild (`vsce package --no-dependencies`).

## Develop (from repo root)

```bash
cd ../..
npm ci
npm run build -w @mergetonic/core
npm run compile -w merge-conflict-resolver
npm run test -w merge-conflict-resolver
```

## Develop (this folder only)

If dependencies are already installed at the monorepo root:

```bash
npm run compile
npm test
```

## Package dry-run

```bash
npx --yes @vscode/vsce package --no-dependencies
```

The marketplace `name` is `merge-conflict-resolver` (publisher `tonic-ai`).
