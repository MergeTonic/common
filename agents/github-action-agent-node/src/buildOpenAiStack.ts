import type { ConflictFile, ConflictRegion } from "@mergetonic/core";

import { AiResponseCacheFacade } from "./aiResponseCache";
import {
  getCacheDir,
  getCacheTtlHours,
  getSystemPromptOverride,
  getUseCache,
  getUseRetries,
} from "./aiEnvConfig";
import { retryConfigFromEnv, withRetries } from "./aiRetry";
import { loadOpenAiClientConfig, postChatCompletions } from "./openAiFetch";
import {
  buildConflictUserMessage,
  buildSystemPromptBody,
  githubJsonResponseSuffix,
  promptTemplateFromEnv,
} from "./promptEngineering";

export type OpenAiResolveStack = {
  resolveConflict(cf: ConflictFile, reg: ConflictRegion): Promise<string | null>;
};

export function buildOpenAiStack(): OpenAiResolveStack | null {
  const cfg = loadOpenAiClientConfig();
  if (!cfg) {
    return null;
  }

  const template = promptTemplateFromEnv();
  const useRetries = getUseRetries();
  const retryCfg = retryConfigFromEnv();
  const cache = AiResponseCacheFacade.fromEnv(
    getUseCache(),
    getCacheTtlHours(),
    getCacheDir(),
    process.cwd(),
  );

  const runOnce = async (cf: ConflictFile, reg: ConflictRegion) => {
    const override = getSystemPromptOverride();
    const systemBase = override ?? buildSystemPromptBody(template);
    const system = systemBase + githubJsonResponseSuffix();
    const user = buildConflictUserMessage(cf, reg, template);
    return postChatCompletions(cfg, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
  };

  const runWithRetry = (cf: ConflictFile, reg: ConflictRegion) =>
    useRetries ? withRetries(retryCfg, () => runOnce(cf, reg)) : runOnce(cf, reg);

  return {
    async resolveConflict(cf: ConflictFile, reg: ConflictRegion): Promise<string | null> {
      const hit = cache.getConflict(cfg.model, cf, reg);
      if (hit) {
        return hit.content || null;
      }
      const { content, model } = await runWithRetry(cf, reg);
      cache.putConflict(cfg.model, cf, reg, { content, model });
      return content || null;
    },
  };
}
