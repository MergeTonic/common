# Contributing Documentation

## Policy

- Documentation source of truth is this repository (`mergetonic/common`).
- GitHub Wiki is a published mirror of `wiki-src/`.
- Do not edit wiki pages directly in the GitHub wiki UI.
- All docs changes must flow through pull requests in `common`.

## Required workflow

1. Edit or add markdown pages under `wiki-src/`.
2. Update `wiki-src/_DocMap.json` when adding or renaming canonical pages.
3. Ensure internal links use stable wiki page slugs.
4. Run docs validation checks before merge.
5. Merge to `main` to trigger wiki publish automation.

## Review requirements

- At least one maintainer review for docs changes.
- Confirm page naming follows `wiki-src/Naming-Conventions.md`.
- Confirm component-facing READMEs/manifests still reference canonical wiki links.
