import type { ConflictFile, ConflictRegion } from "@mergetonic/core";

import { buildOpenAiStack, type OpenAiResolveExtras } from "./buildOpenAiStack";

export async function resolveConflictWithOpenAi(
  cf: ConflictFile,
  reg: ConflictRegion,
  extras?: OpenAiResolveExtras,
): Promise<string | null> {
  const stack = buildOpenAiStack();
  if (!stack) {
    return null;
  }
  return stack.resolveConflict(cf, reg, extras);
}
