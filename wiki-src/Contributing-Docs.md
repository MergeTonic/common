# Contributing Documentation

## Policy

- **Canonical published docs** are markdown under **`wiki-src/`** in this monorepo. The GitHub Wiki is a published mirror; do not edit wiki pages only in the GitHub UI.
- **`logs/docs/`** may contain working notes, migration drafts, and long-form investigations. Treat it as **non-canonical** unless content has been promoted into **`wiki-src/`**. Prefer updating the wiki for anything operators or integrators should rely on.

## Required workflow

1. Edit or add pages under **`wiki-src/`**.
2. Update **`wiki-src/_Sidebar.md`** and **`wiki-src/Home.md`** when adding navigable pages.
3. Update **`wiki-src/_DocMap.json`** when adding stable short links from READMEs or packages.
4. If wiki publish runs in **pilot allowlist** mode, add new `*.md` filenames to **`wiki-src/_PublishConfig.json`** → `allowlist_pages`.
5. Use internal links with stable wiki slugs: `[[Page-Name]]` matching the file stem (e.g. `Hydration-Pipeline.md` → `[[Hydration-Pipeline]]`).
6. Merge to the branch your automation uses (typically `main`) to trigger wiki publish.

## Agent prompt bundles

Hydration and conflict prompts are authored as markdown under **`prompts/`**, then generated into a single JSON bundle:

1. Edit **`prompts/hydration/*.md`** and **`prompts/conflict/*.md`** (YAML frontmatter + `{{var}}` bodies as documented in `scripts/generate_prompt_bundle.py`).
2. Run **`python scripts/generate_prompt_bundle.py`** to refresh **`agents/shared-tonic-ai-prompts/prompts.v1.json`**.
3. Run **`python scripts/sync_agent_ai_prompts.py`** (or the repo’s Node wrapper) to copy the bundle into **`agents/github-action-agent`** and **`agents/github-action-agent-node`**.
4. CI should run **`python scripts/generate_prompt_bundle.py --check`** so the bundle stays in sync with markdown sources.

## Review requirements

- At least one maintainer review for substantive docs changes.
- Confirm naming follows [[Naming-Conventions]].
- Confirm package **`homepage`** / **Documentation** URLs in `package.json` / `pyproject.toml` still point at the right wiki slugs when you rename pages.
