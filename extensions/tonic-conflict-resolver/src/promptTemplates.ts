/**
 * Optional parity with agent prompt templates: load canonical `prompts/conflict/*.md` via
 * `agents/shared-tonic-ai-prompts/prompts.v1.json` (repo root), with fallbacks if the file is missing.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { parseConflictLabel } from "@mergetonic/core";

type SharedBundleV1 = {
  system_prompts?: Record<string, string>;
  github_json_response_suffix?: string;
};

function loadSharedPromptBundle(): SharedBundleV1 {
  try {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const p = path.join(repoRoot, "agents", "shared-tonic-ai-prompts", "prompts.v1.json");
    if (!fs.existsSync(p)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(p, "utf8")) as SharedBundleV1;
  } catch {
    return {};
  }
}

const _bundle = loadSharedPromptBundle();
const _sp = _bundle.system_prompts ?? {};

export const DEFAULT_SYSTEM_PROMPT =
  (_sp.default ?? "").trim() ||
  `You are an expert software developer helping to resolve merge conflicts
described with Tonic semantic markers. "Left" is the base branch version; "right" is the head (PR) version.
Conflict kinds include added left, added right, added both, deleted left, deleted right.`;

export const ENHANCED_SYSTEM_PROMPT =
  (_sp.enhanced ?? "").trim() ||
  `You are an expert specializing in Tonic-style merge conflicts.
Interpret left (base) vs right (head) by meaning. Conflict kinds label how each side changed; resolve with semantic understanding.`;

export const CONTEXT_AWARE_SYSTEM_PROMPT =
  (_sp.context_aware ?? "").trim() ||
  `You are an expert specializing in Tonic merge conflicts.
Compare left (base) and right (head); use BASE / surrounding file context when the user provides it.`;

/** Aligns with mergetonic-github-agent / parse_resolved_lines_from_ai JSON contract. */
export const CHAT_OUTPUT_JSON_INSTRUCTIONS =
  (_bundle.github_json_response_suffix ?? "").trim() ||
  `You MUST respond with a single JSON object only, no markdown fences, using this shape: {"resolved_lines":["each output line"],"rationale":"one short sentence"}. Each resolved_lines entry is one logical line (no embedded newlines).`;

export type PromptContextFormat = "cursor" | "vscode" | "both" | "none";

function contextMentions(path: string, format: PromptContextFormat): string[] {
  if (format === "cursor") {
    return [`Context file (Cursor): @${path}`];
  }
  if (format === "vscode") {
    return [`Context file (VS Code): #${path}`];
  }
  if (format === "both") {
    return [`Context file (Cursor): @${path}`, `Context file (VS Code): #${path}`];
  }
  return [];
}

export function buildHydratedConflictPrompt(params: {
  workspaceRelativePath: string;
  conflictKind: string;
  leftHunk: string;
  rightHunk: string;
  conflictStartLine?: number;
  conflictEndLine?: number;
  mergedReportMeta?: string;
  contextFormat?: PromptContextFormat;
}): string {
  const contextFormat = params.contextFormat ?? "none";
  const parts = [
    `File (workspace-relative): ${params.workspaceRelativePath}`,
    ...contextMentions(params.workspaceRelativePath, contextFormat),
    ...(typeof params.conflictStartLine === "number" && typeof params.conflictEndLine === "number"
      ? [`Conflict range (1-based lines): ${params.conflictStartLine}-${params.conflictEndLine}`]
      : []),
    `Conflict kind: ${params.conflictKind}`,
    ...(() => {
      const parsed = parseConflictLabel(params.conflictKind);
      const tags = Object.entries(parsed.tags).map(([k, v]) => `${k}=${v}`);
      return tags.length ? [`Conflict tags: ${tags.join(", ")}`] : [];
    })(),
    `--- Left (base) ---`,
    params.leftHunk || "(empty)",
    `--- Right (head) ---`,
    params.rightHunk || "(empty)",
  ];
  if (params.mergedReportMeta) {
    parts.push("--- CI merge report ---", params.mergedReportMeta);
  }
  parts.push(
    "",
    "Propose merged lines that replace the entire Tonic conflict block (output must not include marker lines).",
  );
  return parts.join("\n");
}
