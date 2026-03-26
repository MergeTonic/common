/**
 * Parse standard Git merge conflict markers (not Tonic weave markers).
 * Produces {@link ConflictBlock} shapes so UI code can share code paths with Tonic blocks.
 */

import type { ConflictBlock } from "./conflictParser";

const GIT_BEGIN = /^<<<<<<< (.+)$/;
const GIT_SEP = /^=======\s*$/;
const GIT_END = /^>>>>>>> (.+)$/;

export function parseGitConflicts(text: string): ConflictBlock[] {
  return parseGitConflictsWithDiagnostics(text).blocks;
}

export function parseGitConflictsWithDiagnostics(text: string): {
  blocks: ConflictBlock[];
  warnings: string[];
} {
  const lines = text.split(/\r?\n/);
  const blocks: ConflictBlock[] = [];
  const warnings: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const beginMatch = GIT_BEGIN.exec(lines[i]!);
    if (!beginMatch) {
      i += 1;
      continue;
    }

    const startLine = i;
    const oursRef = beginMatch[1]!.trim();
    i += 1;

    const oursLines: string[] = [];
    while (i < lines.length) {
      const line = lines[i]!;
      if (GIT_SEP.test(line)) {
        break;
      }
      if (GIT_BEGIN.exec(line)) {
        warnings.push(
          `Nested Git conflict marker inside "ours" hunk starting at line ${startLine + 1} (line ${i + 1})`,
        );
      }
      oursLines.push(line);
      i += 1;
    }

    if (i >= lines.length) {
      warnings.push(`Unterminated Git conflict (missing =======) starting at line ${startLine + 1}`);
      break;
    }
    i += 1; // skip =======

    const theirsLines: string[] = [];
    let closed = false;
    while (i < lines.length) {
      const line = lines[i]!;
      const endMatch = GIT_END.exec(line);
      if (endMatch) {
        const theirsRef = endMatch[1]!.trim();
        blocks.push({
          startLine,
          endLine: i,
          kind: "git merge",
          segments: [
            { label: oursRef, lines: oursLines },
            { label: theirsRef, lines: theirsLines },
          ],
        });
        i += 1;
        closed = true;
        break;
      }
      if (GIT_BEGIN.exec(line)) {
        warnings.push(
          `Nested Git conflict marker inside "theirs" hunk starting at line ${startLine + 1} (line ${i + 1})`,
        );
      }
      theirsLines.push(line);
      i += 1;
    }

    if (!closed) {
      warnings.push(`Unterminated Git conflict (missing >>>>>>>) starting at line ${startLine + 1}`);
    }
  }

  return { blocks, warnings };
}

export function hasGitConflictMarkers(text: string): boolean {
  return /^<<<<<<< /m.test(text);
}
