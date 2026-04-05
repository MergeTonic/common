import * as fs from "node:fs";
import * as path from "node:path";

/** Windows-friendly hook writer (no POSIX chmod required). */
export function installHooksNode(repoRoot: string, mergetonicCmd = "merge-tonic"): void {
  const hooks = path.join(repoRoot, ".git", "hooks");
  fs.mkdirSync(hooks, { recursive: true });
  const body = `${mergetonicCmd} weave verify --staged --repo "$(git rev-parse --show-toplevel)"\r\n`;
  const preCommit = `@echo off\r\n${mergetonicCmd} weave verify --staged --repo %CD%\r\n`;
  fs.writeFileSync(path.join(hooks, "pre-commit"), preCommit, "utf8");
  fs.writeFileSync(path.join(hooks, "pre-commit.sh"), `#!/bin/sh\n${body}`, "utf8");
}
