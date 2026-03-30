import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import {
  gitConflictBlocksToTonicAnnotatedPreview,
  parseGitConflicts,
  type GitMergeHydrationOptions,
} from "@mergetonic/core";
import type { HydratePair } from "./hydrate";

const BINARY = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tgz",
  ".bz2",
  ".7z",
  ".rar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp3",
  ".mp4",
  ".webm",
  ".wasm",
  ".pyc",
  ".class",
  ".jar",
]);

function isProbablyTextPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  for (const ext of BINARY) {
    if (lower.endsWith(ext)) {
      return false;
    }
  }
  return true;
}

function gitOut(cwd: string, args: string[], allowFail = false): string {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (allowFail) {
      const e = error as { stdout?: string; stderr?: string };
      return [e.stdout ?? "", e.stderr ?? ""].join("\n");
    }
    throw error;
  }
}

function readStageLines(cwd: string, stage: "2" | "3", relPath: string): string[] {
  const out = gitOut(cwd, ["show", `:${stage}:${relPath}`], true);
  if (!out) {
    return [];
  }
  const lines = out.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function hasConflictMarkers(lines: string[]): boolean {
  return lines.some((ln) => ln.startsWith("<<<<<<< "));
}

export type GitHydratePair = HydratePair & {
  gitAnnotatedLines?: string[];
  mergedLines?: string[];
};

export function hydrateGitMerge(params: {
  workspace: string;
  baseSha: string;
  headSha: string;
  maxFiles: number;
  gitMergeHydration?: GitMergeHydrationOptions;
}): Record<string, GitHydratePair> {
  const { workspace, baseSha, headSha, maxFiles, gitMergeHydration } = params;
  const isolatedWorkspace = (process.env.TONIC_AGENT_ISOLATED_WORKSPACE ?? "").trim();
  if (isolatedWorkspace && path.resolve(isolatedWorkspace) !== path.resolve(workspace)) {
    throw new Error("hydrateGitMerge workspace mismatch with TONIC_AGENT_ISOLATED_WORKSPACE");
  }
  if (!isolatedWorkspace && process.env.GITHUB_ACTIONS === "true") {
    throw new Error("hydrateGitMerge requires TONIC_AGENT_ISOLATED_WORKSPACE in GitHub Actions");
  }
  gitOut(workspace, ["checkout", "-f", baseSha]);
  const mergeOutput = gitOut(workspace, ["merge", "--no-ff", "--no-commit", headSha], true);
  const mergeFailed = /(^|\n)fatal:|(^|\n)error:/i.test(mergeOutput);
  const unmergedRaw = gitOut(workspace, ["diff", "--name-only", "--diff-filter", "U"], true);
  const paths = unmergedRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (mergeFailed && paths.length === 0) {
    gitOut(workspace, ["merge", "--abort"], true);
    throw new Error(`git merge failed without unmerged files: ${mergeOutput.trim()}`);
  }
  const out: Record<string, GitHydratePair> = {};
  for (const relPath of paths) {
    if (Object.keys(out).length >= maxFiles) {
      break;
    }
    if (!isProbablyTextPath(relPath)) {
      continue;
    }
    const absPath = path.join(workspace, relPath);
    if (!fs.existsSync(absPath)) {
      continue;
    }
    const mergedText = fs.readFileSync(absPath, "utf8");
    const mergedLines = mergedText.split(/\r?\n/);
    if (mergedLines.length > 0 && mergedLines[mergedLines.length - 1] === "") {
      mergedLines.pop();
    }
    if (!hasConflictMarkers(mergedLines)) {
      continue;
    }
    const blocks = parseGitConflicts(mergedText);
    const annotated = gitConflictBlocksToTonicAnnotatedPreview(blocks, {
      repoRoot: workspace,
      leftRef: baseSha,
      rightRef: headSha,
      ...gitMergeHydration,
    });
    out[relPath] = {
      leftLines: readStageLines(workspace, "2", relPath),
      rightLines: readStageLines(workspace, "3", relPath),
      status: "unmerged",
      gitAnnotatedLines: annotated,
      mergedLines,
    };
  }
  gitOut(workspace, ["merge", "--abort"], true);
  return out;
}
