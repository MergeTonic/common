export interface AgentResult {
  resolved_lines: string[];
  rationale?: string;
}

export function parseAgentResult(raw: string): AgentResult {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Agent output must be a JSON object.");
  }
  const obj = parsed as { resolved_lines?: unknown; rationale?: unknown };
  if (!Array.isArray(obj.resolved_lines) || !obj.resolved_lines.every((x) => typeof x === "string")) {
    throw new Error("Agent output must include resolved_lines: string[].");
  }
  for (const ln of obj.resolved_lines) {
    if (ln.includes("\n") || ln.includes("\r")) {
      throw new Error("Each resolved_lines entry must be a single line.");
    }
  }
  return {
    resolved_lines: obj.resolved_lines,
    rationale: typeof obj.rationale === "string" ? obj.rationale : undefined,
  };
}
