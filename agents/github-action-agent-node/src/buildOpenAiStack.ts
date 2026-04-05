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
import { hydrationContextDigest } from "./mergeLlmHydrationContext";

export type OpenAiResolveExtras = {
  /** Markdown appendix from hydrate pipeline artifacts (per conflict file). */
  hydrationAppendix?: string;
};

export type OpenAiResolveStack = {
  resolveConflict(
    cf: ConflictFile,
    reg: ConflictRegion,
    extras?: OpenAiResolveExtras,
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

  const runOnce = async (cf: ConflictFile, reg: ConflictRegion, extras?: OpenAiResolveExtras) => {
    const override = getSystemPromptOverride();
    const systemBase = override ?? buildSystemPromptBody(template);
    const system = systemBase + githubJsonResponseSuffix();
    const baseUser = buildConflictUserMessage(cf, reg, template);
    const appendix = extras?.hydrationAppendix?.trim();
    const user = appendix ? `${baseUser}\n\n${appendix}` : baseUser;
    return postChatCompletions(cfg, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
  };

  const runWithRetry = (cf: ConflictFile, reg: ConflictRegion, extras?: OpenAiResolveExtras) =>
    useRetries ? withRetries(retryCfg, () => runOnce(cf, reg, extras)) : runOnce(cf, reg, extras);

  return {
    async resolveConflict(
      cf: ConflictFile,
      reg: ConflictRegion,
      extras?: OpenAiResolveExtras,
    ): Promise<string | null> {
      const appendix = extras?.hydrationAppendix?.trim() ?? "";
      const hydrationDigest = appendix ? hydrationContextDigest(appendix) : "";
      const hit = cache.getConflict(cfg.model, cf, reg, hydrationDigest);
      if (hit) {
        return hit.content || null;
      }
      const { content, model } = await runWithRetry(cf, reg, extras);
      cache.putConflict(cfg.model, cf, reg, { content, model }, hydrationDigest);
      return content || null;
    },
  };
}
