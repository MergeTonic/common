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
  resolveConflict(
    cf: ConflictFile,
    reg: ConflictRegion,
    expectedResolvedLineCount?: number,
  ): Promise<string | null>;
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

  const runOnce = async (
    cf: ConflictFile,
    reg: ConflictRegion,
    expectedResolvedLineCount?: number,
  ) => {
    const override = getSystemPromptOverride();
    const systemBase = override ?? buildSystemPromptBody(template);
    const system = systemBase + githubJsonResponseSuffix();
    const user = buildConflictUserMessage(cf, reg, template, expectedResolvedLineCount);
    return postChatCompletions(cfg, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
  };

  const runWithRetry = (
    cf: ConflictFile,
    reg: ConflictRegion,
    expectedResolvedLineCount?: number,
  ) =>
    useRetries
      ? withRetries(retryCfg, () => runOnce(cf, reg, expectedResolvedLineCount))
      : runOnce(cf, reg, expectedResolvedLineCount);

  return {
    async resolveConflict(
      cf: ConflictFile,
      reg: ConflictRegion,
      expectedResolvedLineCount?: number,
    ): Promise<string | null> {
      const hit = cache.getConflict(cfg.model, cf, reg, expectedResolvedLineCount);
      if (hit) {
        return hit.content || null;
      }
      const { content, model } = await runWithRetry(cf, reg, expectedResolvedLineCount);
      cache.putConflict(cfg.model, cf, reg, { content, model }, expectedResolvedLineCount);
      return content || null;
    },
  };
}
