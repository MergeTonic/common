import { HydrationRuntimeError } from "./errors";
import { resolveHydrationLlmConfig, type HydrationLlmConfig } from "./llmConfig";

export type HydrationLlmRole = "system" | "user";

export type HydrationLlmMessage = {
  role: HydrationLlmRole;
  content: string;
};

export interface HydrationLlmService {
  readonly providerId: string;
  readonly model: string;
  generateJson<T>(args: {
    messages: HydrationLlmMessage[];
    schemaName: string;
    schemaDescription: string;
  }): Promise<T>;
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  throw new HydrationRuntimeError("LLM response did not contain a JSON object.");
}

class OpenAiHydrationLlmService implements HydrationLlmService {
  readonly providerId = "openai";
  readonly model: string;
  readonly config: HydrationLlmConfig;

  constructor(config: HydrationLlmConfig) {
    if (!config.apiKey) {
      throw new HydrationRuntimeError(
        "TONIC_HYDRATION_LLM_MODE=openai requires TONIC_HYDRATION_LLM_API_KEY or OPENAI_API_KEY.",
      );
    }
    this.config = config;
    this.model = config.model;
  }

  async generateJson<T>(args: {
    messages: HydrationLlmMessage[];
    schemaName: string;
    schemaDescription: string;
  }): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            ...args.messages,
            {
              role: "system",
              content:
                `Return only a JSON object for schema '${args.schemaName}'. `
                + `Required shape: ${args.schemaDescription}`,
            },
          ],
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new HydrationRuntimeError(`OpenAI HTTP ${response.status}: ${text}`);
      }
      const payload = JSON.parse(text) as {
        choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      const output =
        typeof content === "string" ? content
        : Array.isArray(content) ? content.map((entry) => entry.text ?? "").join("")
        : "";
      return JSON.parse(extractJsonObject(output)) as T;
    } catch (error) {
      if (error instanceof HydrationRuntimeError) {
        throw error;
      }
      throw new HydrationRuntimeError(
        `Failed to generate structured hydration output via ${this.providerId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createHydrationLlmService(
  env: NodeJS.ProcessEnv = process.env,
): HydrationLlmService | null {
  const config = resolveHydrationLlmConfig(env);
  if (config.mode === "deterministic") {
    return null;
  }
  return new OpenAiHydrationLlmService(config);
}

