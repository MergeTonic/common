/** Mirrors `tonic_agent/env_config.py` keys used by AI stack. */

function envVar(name: string): string {
  return process.env[name] ?? "";
}

export function getOpenAiApiKey(): string {
  return envVar("TONIC_AGENT_OPENAI_API_KEY").trim();
}

export function getOpenAiBaseUrl(): string {
  return (
    envVar("TONIC_AGENT_OPENAI_BASE_URL") || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
}

export function getOpenAiModel(): string {
  return envVar("TONIC_AGENT_OPENAI_MODEL").trim() || "gpt-4-turbo";
}

export function getTimeoutSeconds(): number {
  const raw = envVar("TONIC_AGENT_TIMEOUT");
  const n = parseInt(raw || "60", 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

export function getSystemPromptOverride(): string | undefined {
  const v = process.env.TONIC_AGENT_SYSTEM_PROMPT?.trim();
  return v || undefined;
}

export function getPromptTemplateName(): string | undefined {
  const v = envVar("TONIC_AGENT_PROMPT_TEMPLATE").trim();
  return v || undefined;
}

export function getUseCache(): boolean {
  const raw = envVar("TONIC_AGENT_USE_CACHE");
  if (!raw) {
    return true;
  }
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function getCacheDir(): string | undefined {
  const v = envVar("TONIC_AGENT_CACHE_DIR").trim();
  return v || undefined;
}

export function getCacheTtlHours(): number {
  const raw = envVar("TONIC_AGENT_CACHE_TTL_HOURS");
  const n = parseInt(raw || "24", 10);
  return Number.isFinite(n) && n > 0 ? n : 24;
}

export function getUseRetries(): boolean {
  const raw = envVar("TONIC_AGENT_USE_RETRIES");
  if (!raw) {
    return true;
  }
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function envU32(name: string, defaultVal: number): number {
  const raw = process.env[name];
  if (raw && /^\d+$/.test(raw)) {
    return parseInt(raw, 10);
  }
  return defaultVal;
}

export function envFloat(name: string, defaultVal: number): number {
  const raw = process.env[name];
  if (raw) {
    const f = parseFloat(raw);
    if (!Number.isNaN(f)) {
      return f;
    }
  }
  return defaultVal;
}
