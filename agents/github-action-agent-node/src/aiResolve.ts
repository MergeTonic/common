import type { ConflictFile, ConflictRegion } from "@mergetonic/core";

function envKey(primary: string, fallback: string): string {
  return process.env[primary] ?? process.env[fallback] ?? "";
}

function getOpenAiConfig(): { apiKey: string; baseUrl: string; model: string; timeoutSec: number } | null {
  const apiKey = envKey("TONIC_AGENT_OPENAI_API_KEY", "RIZZLER_OPENAI_API_KEY").trim();
  if (!apiKey) {
    return null;
  }
  const baseUrl = (
    envKey("TONIC_AGENT_OPENAI_BASE_URL", "RIZZLER_OPENAI_BASE_URL") || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model =
    envKey("TONIC_AGENT_OPENAI_MODEL", "RIZZLER_OPENAI_MODEL").trim() || "gpt-4-turbo";
  const timeoutSec = parseInt(process.env.TONIC_AGENT_TIMEOUT ?? process.env.RIZZLER_TIMEOUT ?? "60", 10) || 60;
  return { apiKey, baseUrl, model, timeoutSec };
}

const JSON_SUFFIX =
  '\n\nYou MUST respond with a single JSON object only, no markdown fences, using this shape: {"resolved_lines": ["each line of the merged result"], "rationale": "one short sentence"}. Each element of resolved_lines must be one logical line of the file (no embedded newlines).';

function conflictUserMessage(cf: ConflictFile, reg: ConflictRegion): string {
  return [
    `File: ${cf.path}`,
    `Conflict kind: ${reg.conflictKind}`,
    `Left (base) hunk:\n${reg.leftContent || "(empty)"}`,
    `Right (head) hunk:\n${reg.rightContent || "(empty)"}`,
  ].join("\n\n");
}

export async function resolveConflictWithOpenAi(
  cf: ConflictFile,
  reg: ConflictRegion,
): Promise<string | null> {
  const cfg = getOpenAiConfig();
  if (!cfg) {
    return null;
  }
  const system =
    (process.env.TONIC_AGENT_SYSTEM_PROMPT?.trim() ||
      process.env.RIZZLER_SYSTEM_PROMPT?.trim() ||
      "You are an expert software developer helping to resolve Tonic merge conflicts.") + JSON_SUFFIX;
  const url = `${cfg.baseUrl}/chat/completions`;
  const body = JSON.stringify({
    model: cfg.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: conflictUserMessage(cf, reg) },
    ],
  });
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), cfg.timeoutSec * 1000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body,
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`OpenAI HTTP ${res.status}: ${text}`);
    }
    const data = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content ?? null;
  } finally {
    clearTimeout(t);
  }
}
