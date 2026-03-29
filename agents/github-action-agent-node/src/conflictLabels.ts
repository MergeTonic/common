import type { ConflictFile } from "@mergetonic/core";

/** Prefer INPUT_AUTHOR_ALIAS_*; else INPUT_GITHUB_LOGIN_*; else existing labels (defaults from parser). */
export function applyPrLabelsToConflictFile(cf: ConflictFile): ConflictFile {
  const left =
    process.env.INPUT_AUTHOR_ALIAS_LEFT?.trim() ||
    process.env.INPUT_GITHUB_LOGIN_LEFT?.trim() ||
    cf.leftLabel ||
    "left";
  const right =
    process.env.INPUT_AUTHOR_ALIAS_RIGHT?.trim() ||
    process.env.INPUT_GITHUB_LOGIN_RIGHT?.trim() ||
    cf.rightLabel ||
    "right";
  return { ...cf, leftLabel: left, rightLabel: right };
}
