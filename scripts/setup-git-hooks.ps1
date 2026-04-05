# Point this repository at tracked hooks under .githooks/ (no Husky).
$ErrorActionPreference = "Stop"
$root = git rev-parse --show-toplevel
Set-Location $root
git config --local core.hooksPath .githooks
Write-Host "Git hooksPath set to .githooks for this clone (pre-commit checks extension bundle when relevant files are staged)."
