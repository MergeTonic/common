#!/bin/sh
# Point this repository at tracked hooks under .githooks/ (no Husky).
set -e
root=$(git rev-parse --show-toplevel)
cd "$root"
git config --local core.hooksPath .githooks
chmod +x .githooks/pre-commit 2>/dev/null || true
echo "Git hooksPath set to .githooks for this clone (pre-commit checks extension bundle when relevant files are staged)."
