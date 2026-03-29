import {
  getOpenAiApiKey,
  getOpenAiBaseUrl,
  getOpenAiModel,
  getTimeoutSeconds,
} from "./aiEnvConfig";

export type ChatMessage = { role: string; content: string };

export type OpenAiClientConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutSec: number;
};

export function loadOpenAiClientConfig(): OpenAiClientConfig | null {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return null;
  }
  return {
    apiKey,
    baseUrl: getOpenAiBaseUrl(),
    model: getOpenAiModel(),
    timeoutSec: getTimeoutSeconds(),
  };
}

export async function postChatCompletions(
  cfg: OpenAiClientConfig,
  messages: ChatMessage[],
): Promise<{ content: string; model: string }> {
  const url = `${cfg.baseUrl}/chat/completions`;
  const body = JSON.stringify({
    model: cfg.model,
    temperature: 0.2,
    messages,
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
      model?: string;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    const model = String(data.model || cfg.model);
    return { content, model };
  } finally {
    clearTimeout(t);
  }
}
