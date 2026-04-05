import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  DEFAULT_GIT_MERGE_LEFT_INTENT,
  DEFAULT_GIT_MERGE_RIGHT_INTENT,
} from "../markerInterop";
import {
  DEFAULT_INTENT_PROFILE_PATH,
  loadIntentProfile,
  parseIntentPair,
  type IntentProfileV1,
} from "../intentInteractive";
import { applyHydrationTemplate, loadHydrationPromptBody } from "./hydrationPromptTemplate";

export type IntentBootstrapArtifactV1 = {
  schema: "tonic-hydration-intent-bootstrap";
  version: "1";
  left_intent: string;
  right_intent: string;
  sources: Record<string, string>;
  prompt_template_id?: string;
  rendered_excerpt?: string;
};

export type IntentBootstrapInput = {
  repoRoot: string;
  leftIntentFlag?: string;
  rightIntentFlag?: string;
  intentPair?: string;
  intentProfilePath?: string;
  env: NodeJS.ProcessEnv;
  promptTemplateId?: string;
  userQuery?: string;
  followUp?: string;
};

function renderBootstrapExcerpt(
  left: string,
  right: string,
  repoRoot: string,
  userQuery: string,
  followUp: string,
): string {
  const templateId = "hydration.intent_bootstrap";
  const tpl = loadHydrationPromptBody(templateId);
  if (tpl?.trim()) {
    const repoName = path.basename(path.resolve(repoRoot)) || ".";
    return applyHydrationTemplate(tpl, {
      left_intent: left,
      right_intent: right,
      repo_name: repoName,
      user_query: userQuery,
      follow_up: followUp,
    });
  }
  return `Left intent: ${left}\nRight intent: ${right}`;
}

export function resolveIntentBootstrap(input: IntentBootstrapInput): IntentBootstrapArtifactV1 {
  const sources: Record<string, string> = {};
  let left = "";
  let right = "";

  const profilePath =
    input.intentProfilePath?.trim() ||
    path.join(input.repoRoot, DEFAULT_INTENT_PROFILE_PATH);
  const prof = loadIntentProfile(profilePath) as IntentProfileV1 | null;

  if (prof?.leftIntent?.trim()) {
    left = prof.leftIntent.trim();
    sources.left = "profile_file";
  }
  if (prof?.rightIntent?.trim()) {
    right = prof.rightIntent.trim();
    sources.right = "profile_file";
  }

  if (input.env.TONIC_LEFT_INTENT?.trim()) {
    left = input.env.TONIC_LEFT_INTENT.trim();
    sources.left = "env";
  }
  if (input.env.TONIC_RIGHT_INTENT?.trim()) {
    right = input.env.TONIC_RIGHT_INTENT.trim();
    sources.right = "env";
  }

  const pair = parseIntentPair(input.intentPair ?? "");
  if (pair) {
    left = pair.left;
    right = pair.right;
    sources.left = "intent_pair";
    sources.right = "intent_pair";
  }

  if (input.leftIntentFlag?.trim()) {
    left = input.leftIntentFlag.trim();
    sources.left = "cli_flag";
  }
  if (input.rightIntentFlag?.trim()) {
    right = input.rightIntentFlag.trim();
    sources.right = "cli_flag";
  }

  if (!left) {
    left = DEFAULT_GIT_MERGE_LEFT_INTENT;
    sources.left = "default";
  }
  if (!right) {
    right = DEFAULT_GIT_MERGE_RIGHT_INTENT;
    sources.right = "default";
  }

  const templateId = input.promptTemplateId ?? "hydration.intent_bootstrap";
  const uq = (input.userQuery ?? "").trim();
  const fu = (input.followUp ?? "").trim();
  return {
    schema: "tonic-hydration-intent-bootstrap",
    version: "1",
    left_intent: left,
    right_intent: right,
    sources,
    prompt_template_id: templateId,
    rendered_excerpt: renderBootstrapExcerpt(left, right, input.repoRoot, uq, fu),
  };
}

export function writeIntentBootstrap(pathOut: string, art: IntentBootstrapArtifactV1): void {
  fs.mkdirSync(path.dirname(path.resolve(pathOut)), { recursive: true });
  fs.writeFileSync(pathOut, JSON.stringify(art, null, 2) + "\n", "utf8");
}

export function digestForRefinementContext(parts: string[]): string {
  const h = crypto.createHash("sha256");
  for (const p of parts) {
    h.update(p);
    h.update("\n");
  }
  return h.digest("hex");
}
