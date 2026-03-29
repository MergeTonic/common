import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline/promises";

import { DEFAULT_GIT_MERGE_LEFT_INTENT, DEFAULT_GIT_MERGE_RIGHT_INTENT } from "./markerInterop";

export type IntentProfileV1 = {
  version: 1;
  leftIntent?: string;
  rightIntent?: string;
};

export const DEFAULT_INTENT_PROFILE_PATH = ".tonic/intent-profile.json";

export function loadIntentProfile(filePath: string): IntentProfileV1 | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const j = JSON.parse(raw) as IntentProfileV1;
    if (j && typeof j === "object") {
      return { version: 1, leftIntent: j.leftIntent, rightIntent: j.rightIntent };
    }
  } catch {
    return null;
  }
  return null;
}

export function saveIntentProfile(filePath: string, profile: IntentProfileV1): void {
  const abs = path.resolve(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(
    abs,
    JSON.stringify(
      { version: 1, leftIntent: profile.leftIntent, rightIntent: profile.rightIntent },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

export function parseIntentPair(raw: string): { left: string; right: string } | null {
  const s = raw.trim();
  if (!s) {
    return null;
  }
  const idx = s.indexOf(",");
  if (idx < 0) {
    return null;
  }
  const left = s.slice(0, idx).trim();
  const right = s.slice(idx + 1).trim();
  if (!left || !right) {
    return null;
  }
  return { left, right };
}

export async function promptIntentPairInteractive(params: {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  defaultLeft?: string;
  defaultRight?: string;
}): Promise<{ leftIntent: string; rightIntent: string }> {
  const input = params.input ?? process.stdin;
  const output = params.output ?? process.stdout;
  const dl = params.defaultLeft ?? DEFAULT_GIT_MERGE_LEFT_INTENT;
  const dr = params.defaultRight ?? DEFAULT_GIT_MERGE_RIGHT_INTENT;
  const rl = readline.createInterface({ input, output });
  try {
    const leftRaw = (await rl.question(`Left (base) intent [${dl}]: `)).trim();
    const rightRaw = (await rl.question(`Right (head) intent [${dr}]: `)).trim();
    return {
      leftIntent: leftRaw || dl,
      rightIntent: rightRaw || dr,
    };
  } finally {
    rl.close();
  }
}
