import * as fs from "node:fs";
import * as path from "node:path";

export type RepoStructureArtifactV1 = {
  schema: "tonic-repo-structure";
  version: "1";
  repo_root: string;
  top_level: string[];
  max_depth: number;
};

export function summarizeRepoStructure(repoRoot: string, maxDepth = 2): RepoStructureArtifactV1 {
  const top: string[] = [];
  try {
    for (const e of fs.readdirSync(repoRoot, { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules" || e.name === ".tonic") {
        continue;
      }
      top.push(e.name);
    }
  } catch {
    /* ignore */
  }
  top.sort();
  return {
    schema: "tonic-repo-structure",
    version: "1",
    repo_root: repoRoot.replace(/\\/g, "/"),
    top_level: top,
    max_depth: maxDepth,
  };
}

export function writeRepoStructure(pathOut: string, art: RepoStructureArtifactV1): void {
  fs.mkdirSync(path.dirname(path.resolve(pathOut)), { recursive: true });
  fs.writeFileSync(pathOut, JSON.stringify(art, null, 2) + "\n", "utf8");
}

export function repoStructureExcerpt(art: RepoStructureArtifactV1): string {
  return `Top-level: ${art.top_level.join(", ")}`;
}
