import * as fs from "node:fs";
import * as path from "node:path";

import { digestForRefinementContext } from "./intentBootstrap";
import { applyHydrationTemplate, loadHydrationPromptBody } from "./hydrationPromptTemplate";
import { callOpenAiCompatibleJson, parseQuestionRefinementJson } from "./llmRefinement";
import type { ResolvedHydrationConfig } from "./hydrationConfig";

export type QuestionRefinementArtifactV1 = {
  schema: "tonic-question-refinement";
  version: "1";
  mode: "off" | "improver" | "subquestions";
  refined_left_intent?: string;
  refined_right_intent?: string;
  merge_goals?: string[];
  assumptions?: string[];
  subquestions?: Array<{ id: string; text: string; priority?: number }>;
  model_id?: string;
  prompt_template_ids?: string[];
  context_digest_sha256?: string;
};

export type PostRetrievalRefinementArtifactV1 = {
  schema: "tonic-question-refinement-post-retrieval";
  version: "1";
  mode: "improver";
  refined_left_intent?: string;
  refined_right_intent?: string;
  merge_goals?: string[];
  assumptions?: string[];
  model_id?: string;
  prompt_template_ids?: string[];
  context_digest_sha256?: string;
};

const IMPROVER_SYSTEM_FALLBACK =
  "You output only valid JSON with keys refined_left_intent, refined_right_intent, merge_goals (string array), assumptions (string array).";
const SUBQ_SYSTEM_FALLBACK =
  'You output only valid JSON with key subquestions: array of {id, text, priority (number)}.';
const POST_RETRIEVAL_SYSTEM_FALLBACK =
  "You output only valid JSON with keys refined_left_intent, refined_right_intent, merge_goals (string array), assumptions (string array), informed_by_retrieval (boolean optional).";

export type RefinementRunResult =
  | { kind: "artifact"; artifact: QuestionRefinementArtifactV1; skippedLlm: boolean; warning?: string }
  | { kind: "fail"; message: string; code: 11 };

function refinementDigestParts(params: {
  leftIntent: string;
  rightIntent: string;
  conflictRegionsJson: string;
  repoStructureExcerpt: string;
  userQuery: string;
  followUp: string;
  conflictHunksExcerptJson: string;
  astMatchesExcerptJson: string;
  retrievalHitsPreR1Json: string;
  retrievalHitsPass2Json: string;
  repoHeadShort: string;
  mergeBranchHints: string;
  priorRefinementPassLabel: string;
  priorPhasesDigestForCache: string;
}): string[] {
  return [
    params.leftIntent,
    params.rightIntent,
    params.conflictRegionsJson,
    params.repoStructureExcerpt,
    params.userQuery,
    params.followUp,
    params.conflictHunksExcerptJson,
    params.astMatchesExcerptJson,
    params.retrievalHitsPreR1Json,
    params.retrievalHitsPass2Json,
    params.repoHeadShort,
    params.mergeBranchHints,
    params.priorRefinementPassLabel,
    params.priorPhasesDigestForCache,
  ];
}

export async function runQuestionRefinement(params: {
  mode: "off" | "improver" | "subquestions";
  config: ResolvedHydrationConfig;
  leftIntent: string;
  rightIntent: string;
  conflictRegionsJson: string;
  repoStructureExcerpt: string;
  priorPhasesDigest?: string;
  priorRefinementPassLabel?: string;
  userQuery?: string;
  followUp?: string;
  conflictHunksExcerptJson?: string;
  astMatchesExcerptJson?: string;
  retrievalHitsPreR1Json?: string;
  retrievalHitsPass2Json?: string;
  repoHeadShort?: string;
  mergeBranchHints?: string;
  env: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<RefinementRunResult> {
  const userQuery = (params.userQuery ?? "").trim();
  const followUp = (params.followUp ?? "").trim();
  const conflictHunksExcerptJson = (params.conflictHunksExcerptJson ?? "").trim() || "[]";
  const astMatchesExcerptJson = (params.astMatchesExcerptJson ?? "").trim() || "[]";
  const retrievalHitsPreR1Json = (params.retrievalHitsPreR1Json ?? "").trim() || "[]";
  const retrievalHitsPass2Json = (params.retrievalHitsPass2Json ?? "").trim() || "[]";
  const repoHeadShort = (params.repoHeadShort ?? "").trim();
  const mergeBranchHints = (params.mergeBranchHints ?? "").trim();
  const priorLabel = (params.priorRefinementPassLabel ?? "").trim() || "none";
  const priorForCache = (params.priorPhasesDigest ?? "").trim();

  const digest = digestForRefinementContext(
    refinementDigestParts({
      leftIntent: params.leftIntent,
      rightIntent: params.rightIntent,
      conflictRegionsJson: params.conflictRegionsJson,
      repoStructureExcerpt: params.repoStructureExcerpt,
      userQuery,
      followUp,
      conflictHunksExcerptJson,
      astMatchesExcerptJson,
      retrievalHitsPreR1Json,
      retrievalHitsPass2Json,
      repoHeadShort,
      mergeBranchHints,
      priorRefinementPassLabel: priorLabel,
      priorPhasesDigestForCache: priorForCache,
    }),
  );

  if (params.mode === "off") {
    return {
      kind: "artifact",
      skippedLlm: true,
      artifact: {
        schema: "tonic-question-refinement",
        version: "1",
        mode: "off",
        refined_left_intent: params.leftIntent,
        refined_right_intent: params.rightIntent,
        context_digest_sha256: digest,
      },
    };
  }

  const keyName = params.config.openaiApiKeyEnv || "OPENAI_API_KEY";
  let apiKey = (params.env[keyName] ?? "").trim();
  const baseLower = params.config.llmBaseUrl.toLowerCase();
  const localhost =
    baseLower.includes("127.0.0.1") ||
    baseLower.includes("localhost") ||
    baseLower.includes("0.0.0.0");
  const allowDummy = params.env.TONIC_LLM_ALLOW_DUMMY_KEY?.trim() === "1";
  if (!apiKey && (localhost || allowDummy)) {
    apiKey = "dummy";
  }
  if (!apiKey) {
    if (params.config.strictLlm) {
      return { kind: "fail", message: `missing API key env ${keyName}`, code: 11 };
    }
    return {
      kind: "artifact",
      skippedLlm: true,
      warning: `skipped question refinement: missing ${keyName}`,
      artifact: {
        schema: "tonic-question-refinement",
        version: "1",
        mode: "off",
        refined_left_intent: params.leftIntent,
        refined_right_intent: params.rightIntent,
        context_digest_sha256: digest,
        prompt_template_ids: [`skipped:${params.mode}`],
      },
    };
  }

  const timeoutMs = parseInt(params.env.TONIC_LLM_TIMEOUT_MS ?? "120000", 10) || 120000;
  const verboseDigest = params.env.TONIC_LLM_VERBOSE_DIGEST?.trim() === "1";
  const priorHex = verboseDigest ? (params.priorPhasesDigest ?? "").trim() : "";

  const templateId =
    params.mode === "improver" ? "hydration.question_improver" : "hydration.subquestion_generator";
  const systemId =
    params.mode === "improver"
      ? "hydration.question_improver_system"
      : "hydration.subquestion_generator_system";
  const systemBody = loadHydrationPromptBody(systemId);
  const system =
    params.mode === "improver"
      ? (systemBody?.trim() ? systemBody.trim() : IMPROVER_SYSTEM_FALLBACK)
      : (systemBody?.trim() ? systemBody.trim() : SUBQ_SYSTEM_FALLBACK);

  const vars: Record<string, string> = {
    left_intent: params.leftIntent,
    right_intent: params.rightIntent,
    repo_structure_excerpt: params.repoStructureExcerpt,
    conflict_regions_json: params.conflictRegionsJson,
    prior_phases_digest: priorHex,
    prior_refinement_pass_label: priorLabel,
    user_query: userQuery,
    follow_up: followUp,
    conflict_hunks_excerpt_json: conflictHunksExcerptJson,
    ast_matches_excerpt_json: astMatchesExcerptJson,
    retrieval_hits_pre_r1_json: retrievalHitsPreR1Json,
    retrieval_hits_pass2_json: retrievalHitsPass2Json,
    repo_head_short: repoHeadShort,
    merge_branch_hints: mergeBranchHints,
  };
  const fromTpl = loadHydrationPromptBody(templateId);
  const user = fromTpl?.trim()
    ? applyHydrationTemplate(fromTpl, vars)
    : params.mode === "improver"
      ? `Left intent: ${params.leftIntent}\nRight intent: ${params.rightIntent}\n` +
        `Repo structure (excerpt):\n${params.repoStructureExcerpt}\n` +
        `Conflict regions (JSON):\n${params.conflictRegionsJson}\n` +
        "Return JSON only."
      : `Left intent: ${params.leftIntent}\nRight intent: ${params.rightIntent}\n` +
        `Repo structure (excerpt):\n${params.repoStructureExcerpt}\n` +
        `Conflict regions (JSON):\n${params.conflictRegionsJson}\n` +
        "Propose up to 8 subquestions as JSON.";

  const llm = await callOpenAiCompatibleJson(
    {
      baseUrl: params.config.llmBaseUrl,
      model: params.config.llmModel,
      apiKey,
      system,
      user,
      timeoutMs,
      jsonObject: params.config.llmJsonObject,
    },
    params.fetchImpl,
  );
  if (!llm.ok) {
    return { kind: "fail", message: llm.message, code: 11 };
  }
  const parsed = parseQuestionRefinementJson(llm.text, params.mode);
  if (!parsed.ok) {
    return { kind: "fail", message: parsed.message, code: 11 };
  }

  const base: QuestionRefinementArtifactV1 = {
    schema: "tonic-question-refinement",
    version: "1",
    mode: params.mode,
    model_id: params.config.llmModel,
    prompt_template_ids:
      params.mode === "improver" ? ["hydration.question_improver"] : ["hydration.subquestion_generator"],
    context_digest_sha256: digest,
    ...parsed.value,
  };
  return { kind: "artifact", skippedLlm: false, artifact: base };
}

export type PostRetrievalRunResult =
  | { kind: "artifact"; artifact: PostRetrievalRefinementArtifactV1; skippedLlm: boolean; warning?: string }
  | { kind: "fail"; message: string; code: 11 };

export async function runPostRetrievalQuestionRefinement(params: {
  config: ResolvedHydrationConfig;
  leftIntent: string;
  rightIntent: string;
  conflictRegionsJson: string;
  repoStructureExcerpt: string;
  retrievalHitsJson: string;
  userQuery?: string;
  followUp?: string;
  env: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<PostRetrievalRunResult> {
  const userQuery = (params.userQuery ?? "").trim();
  const followUp = (params.followUp ?? "").trim();
  const digest = digestForRefinementContext([
    params.leftIntent,
    params.rightIntent,
    params.conflictRegionsJson,
    params.repoStructureExcerpt,
    userQuery,
    followUp,
    params.retrievalHitsJson,
    "post_retrieval",
  ]);

  const keyName = params.config.openaiApiKeyEnv || "OPENAI_API_KEY";
  let apiKey = (params.env[keyName] ?? "").trim();
  const baseLower = params.config.llmBaseUrl.toLowerCase();
  const localhost =
    baseLower.includes("127.0.0.1") ||
    baseLower.includes("localhost") ||
    baseLower.includes("0.0.0.0");
  const allowDummy = params.env.TONIC_LLM_ALLOW_DUMMY_KEY?.trim() === "1";
  if (!apiKey && (localhost || allowDummy)) {
    apiKey = "dummy";
  }
  if (!apiKey) {
    if (params.config.strictLlm) {
      return { kind: "fail", message: `missing API key env ${keyName}`, code: 11 };
    }
    return {
      kind: "artifact",
      skippedLlm: true,
      warning: `skipped post-retrieval refinement: missing ${keyName}`,
      artifact: {
        schema: "tonic-question-refinement-post-retrieval",
        version: "1",
        mode: "improver",
        refined_left_intent: params.leftIntent,
        refined_right_intent: params.rightIntent,
        context_digest_sha256: digest,
        prompt_template_ids: ["skipped:post_retrieval"],
      },
    };
  }

  const timeoutMs = parseInt(params.env.TONIC_LLM_TIMEOUT_MS ?? "120000", 10) || 120000;
  const systemBody = loadHydrationPromptBody("hydration.intent_improver_post_retrieval_system");
  const system = systemBody?.trim() ? systemBody.trim() : POST_RETRIEVAL_SYSTEM_FALLBACK;
  const tpl = loadHydrationPromptBody("hydration.intent_improver_post_retrieval");
  const vars: Record<string, string> = {
    left_intent: params.leftIntent,
    right_intent: params.rightIntent,
    repo_structure_excerpt: params.repoStructureExcerpt,
    conflict_regions_json: params.conflictRegionsJson,
    retrieval_hits_json: params.retrievalHitsJson,
    user_query: userQuery,
    follow_up: followUp,
  };
  const user = tpl?.trim()
    ? applyHydrationTemplate(tpl, vars)
    : `Refine intents using retrieval hits.\nLeft: ${params.leftIntent}\nRight: ${params.rightIntent}\nHits JSON:\n${params.retrievalHitsJson}\nReturn JSON only.`;

  const llm = await callOpenAiCompatibleJson(
    {
      baseUrl: params.config.llmBaseUrl,
      model: params.config.llmModel,
      apiKey,
      system,
      user,
      timeoutMs,
      jsonObject: params.config.llmJsonObject,
    },
    params.fetchImpl,
  );
  if (!llm.ok) {
    return { kind: "fail", message: llm.message, code: 11 };
  }
  const parsed = parseQuestionRefinementJson(llm.text, "improver");
  if (!parsed.ok) {
    return { kind: "fail", message: parsed.message, code: 11 };
  }

  const base: PostRetrievalRefinementArtifactV1 = {
    schema: "tonic-question-refinement-post-retrieval",
    version: "1",
    mode: "improver",
    model_id: params.config.llmModel,
    prompt_template_ids: ["hydration.intent_improver_post_retrieval"],
    context_digest_sha256: digest,
    ...parsed.value,
  };
  return { kind: "artifact", skippedLlm: false, artifact: base };
}

export function writeQuestionRefinement(pathOut: string, art: QuestionRefinementArtifactV1): void {
  fs.mkdirSync(path.dirname(path.resolve(pathOut)), { recursive: true });
  fs.writeFileSync(pathOut, JSON.stringify(art, null, 2) + "\n", "utf8");
}

export function writePostRetrievalRefinement(pathOut: string, art: PostRetrievalRefinementArtifactV1): void {
  fs.mkdirSync(path.dirname(path.resolve(pathOut)), { recursive: true });
  fs.writeFileSync(pathOut, JSON.stringify(art, null, 2) + "\n", "utf8");
}
