import type { ConflictFile, ConflictRegion } from "@mergetonic/core";

import { buildOpenAiStack } from "./buildOpenAiStack";

export async function resolveConflictWithOpenAi(
  cf: ConflictFile,
  reg: ConflictRegion,
  expectedResolvedLineCount?: number,
): Promise<string | null> {
  const stack = buildOpenAiStack();
  if (!stack) {
    return null;
  }
  return stack.resolveConflict(cf, reg, expectedResolvedLineCount);
}
