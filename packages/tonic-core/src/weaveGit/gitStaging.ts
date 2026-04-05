import { spawnSync } from "node:child_process";

/** Staged path keys (forward slashes), or empty set when git is missing or fails. */
export function gitStagedPaths(repoRoot: string): Set<string> {
  const r = spawnSync("git", ["diff", "--cached", "--name-only", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    return new Set();
  }
  const raw = r.stdout ?? "";
  if (!raw) {
    return new Set();
  }
  return new Set(
    raw
      .split("\0")
      .filter(Boolean)
      .map((p) => p.replace(/\\/g, "/")),
  );
}
