import * as fs from "node:fs";
import * as path from "node:path";

import { parseGitConflictsWithDiagnostics } from "../gitConflictParser";

export type ConflictRegionV1 = {
  path: string;
  region_id?: string;
  start_line: number;
  mid_line: number;
  end_line: number;
  ours_label?: string;
  theirs_label?: string;
  hunk_id?: string;
};

export type ConflictContextArtifactV1 = {
  schema: "tonic-conflict-context";
  version: "1";
  scan_scope: string;
  conflict_regions: ConflictRegionV1[];
};

function walkFiles(repoRoot: string): string[] {
  const out: string[] = [];
  function walk(dir: string, base: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === ".git" || e.name === "node_modules" || e.name === ".tonic") {
        continue;
      }
      const rel = path.join(base, e.name).replace(/\\/g, "/");
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, rel);
      } else if (e.isFile()) {
        out.push(rel);
      }
    }
  }
  walk(repoRoot, "");
  return out.sort();
}

export function scanRepoConflictMarkers(repoRoot: string): ConflictContextArtifactV1 {
  const relPaths = walkFiles(repoRoot);
  const regions: ConflictRegionV1[] = [];
  let rid = 0;
  for (const rel of relPaths) {
    const abs = path.join(repoRoot, rel);
    let text: string;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const { blocks } = parseGitConflictsWithDiagnostics(text);
    for (const b of blocks) {
      rid += 1;
      const startLine = b.startLine + 1;
      const endLine = b.endLine + 1;
      const midLine = Math.floor((startLine + endLine) / 2);
      const ours = b.segments[0]?.label ?? "";
      const theirs = b.segments[1]?.label ?? "";
      regions.push({
        path: rel.replace(/\\/g, "/"),
        region_id: `r${rid}`,
        start_line: startLine,
        mid_line: midLine,
        end_line: endLine,
        ours_label: ours || undefined,
        theirs_label: theirs || undefined,
      });
    }
  }
  regions.sort((a, b) => (a.path !== b.path ? a.path.localeCompare(b.path) : a.start_line - b.start_line));
  return {
    schema: "tonic-conflict-context",
    version: "1",
    scan_scope: "workspace",
    conflict_regions: regions,
  };
}

export function writeConflictContext(pathOut: string, art: ConflictContextArtifactV1): void {
  fs.mkdirSync(path.dirname(path.resolve(pathOut)), { recursive: true });
  fs.writeFileSync(pathOut, JSON.stringify(art, null, 2) + "\n", "utf8");
}
