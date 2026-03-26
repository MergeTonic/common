# Wiki Naming Conventions

## Page naming schema

- Use deterministic filenames matching the canonical wiki slug.
- Allowed characters: `A-Z`, `a-z`, `0-9`, `-`, `_`, `.`, `@`.
- Avoid spaces and reserved URL characters (`:`, `#`, `?`, `%`, `\`).

## Sidebar conventions

- Keep `_Sidebar.md` as the authoritative page navigation list.
- Add new pages to the sidebar in a stable top-level order.

## Rename migration policy

- Prefer additive changes over page renames to avoid broken links.
- If a rename is required, update:
  - `wiki-src/_Sidebar.md`
  - `wiki-src/_DocMap.json` (if canonical page changed)
  - all internal wiki links referencing the old slug
- Include rename notes in release/docs operations notes.
