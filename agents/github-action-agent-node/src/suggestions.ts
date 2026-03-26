export { heuristicResolvedLines, suggestionLineCountOk } from "@mergetonic/core";

export function buildUnifiedDiff(oldLines: string[], newLines: string[], path = "file"): string {
  const out = [`--- a/${path}`, `+++ b/${path}`];
  for (const l of oldLines) {
    out.push(`-${l}`);
  }
  for (const l of newLines) {
    out.push(`+${l}`);
  }
  return out.join("\n");
}

export function stripJsonFences(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (m) {
    return m[1]!.trim();
  }
  return t;
}

export function parseResolvedLinesFromAi(
  content: string,
): { lines: string[]; rationale: string | null } {
  const raw = stripJsonFences(content.trim());
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const lines = data.resolved_lines;
    const rat = data.rationale;
    if (Array.isArray(lines) && lines.every((x) => typeof x === "string")) {
      return {
        lines: lines as string[],
        rationale: typeof rat === "string" ? rat : null,
      };
    }
  } catch {
    /* plain text */
  }
  if (!raw) {
    return { lines: [], rationale: null };
  }
  return { lines: raw.split(/\r?\n/), rationale: null };
}

export function buildGithubSuggestionBody(params: {
  summary: string;
  explanation: string | null;
  unifiedDiff: string | null;
  suggestionBlock: string | null;
  includeSuggestionFence: boolean;
}): string {
  const parts: string[] = [params.summary.trimEnd()];
  if (params.explanation) {
    parts.push("", params.explanation.trim(), "");
  }
  if (params.unifiedDiff) {
    parts.push("**Diff (base → proposed):**", "", "```diff", params.unifiedDiff, "```", "");
  }
  if (params.includeSuggestionFence && params.suggestionBlock != null) {
    parts.push(
      "**Suggested change** (use *Commit suggestion* on GitHub):",
      "",
      "```suggestion",
      params.suggestionBlock.replace(/\n$/, ""),
      "```",
    );
  }
  return parts.join("\n").replace(/\n+$/, "\n");
}
