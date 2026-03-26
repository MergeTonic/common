/**
 * Optional parity with Python agent prompt templates (strings only).
 * Tonic uses semantic kinds (added left, deleted right, …), not Git "ours/theirs".
 */

export const DEFAULT_SYSTEM_PROMPT = `You are an expert software developer helping to resolve merge conflicts
described with Tonic semantic markers. "Left" is the base branch version; "right" is the head (PR) version.
Conflict kinds include added left, added right, added both, deleted left, deleted right.`;

export const ENHANCED_SYSTEM_PROMPT = `You are an expert specializing in Tonic-style merge conflicts.
Interpret left (base) vs right (head) by meaning. Conflict kinds label how each side changed; resolve with semantic understanding.`;

export const CONTEXT_AWARE_SYSTEM_PROMPT = `You are an expert specializing in Tonic merge conflicts.
Compare left (base) and right (head); use BASE / surrounding file context when the user provides it.`;

/** Aligns with mergetonic-github-agent / parse_resolved_lines_from_ai JSON contract. */
export const CHAT_OUTPUT_JSON_INSTRUCTIONS = `You MUST respond with a single JSON object only, no markdown fences, using this shape: {"resolved_lines":["each output line"],"rationale":"one short sentence"}. Each resolved_lines entry is one logical line (no embedded newlines).`;

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
