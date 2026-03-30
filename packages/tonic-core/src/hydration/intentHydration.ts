import {
  buildGuidedQuestionGenerationPrompt,
  buildHydrationSynthesisPrompt,
} from "./promptBundle";
import {
  extractHydrationCandidateSymbol,
  inferHydrationCandidateNodeKind,
} from "./astCandidates";
import {
  buildFinalHydrationCycleState,
  buildHydrationCycleRecord,
} from "./cycleModel";
import type { HydrationLlmService } from "./llmService";
import { HYDRATION_PIPELINE_VERSION } from "./types";
import type {
  HydrationBranchIntent,
  HydrationCycleNode,
  HydrationCycleState,
  HydrationFuzzyAlignmentCandidate,
  HydrationIntentTag,
  HydrationMetadataConsolidation,
  HydrationQuestionSlot,
  HydrationRetrievalBundle,
  HydrationRetrievalMerge,
} from "./types";

type HydrationIntentLlmEvent = {
  event: "llm_request" | "llm_response" | "llm_error";
  schemaName: string;
  provider?: string;
  model?: string;
  requestJson?: unknown;
  responseJson?: unknown;
  note?: string;
};

type HydrationTagSynthesis = {
  tagsAdded: HydrationIntentTag[];
  rationale: string;
};

const QUESTION_PLAN_SCHEMA_DESCRIPTION =
  '{"question_slots":[{"id":"string","question":"string","strategy":"guided-llm-meta|template"}]}';

const SYNTHESIS_SCHEMA_DESCRIPTION =
  '{"tags":[{"key":"string","value":"string","display":"string"}],"rationale":"string"}';

const TOKEN_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "this",
  "that",
  "with",
  "from",
  "into",
  "what",
  "which",
  "where",
  "when",
  "does",
  "most",
  "current",
  "branch",
  "intent",
  "intents",
  "hydrate",
  "hydration",
  "repository",
  "context",
  "files",
  "file",
  "modules",
  "module",
  "symbols",
  "symbol",
  "implement",
  "affect",
  "relevant",
  "code",
  "paths",
  "path",
]);

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/g)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length >= 3 && !TOKEN_STOPWORDS.has(entry)),
    ),
  );
}

function slugify(value: string, maxLength: number): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    return "hydration";
  }
  return normalized.slice(0, maxLength).replace(/-+$/g, "") || "hydration";
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.length <= 1 ? trimmed.toUpperCase() : `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)}`;
}

function sanitizeTagKey(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  const normalized = trimmed.replace(/[^a-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "");
  if (!normalized) {
    return "";
  }
  return normalized.startsWith("tonic.") ? normalized : `tonic.ai.${normalized}`;
}

function sanitizeTagValue(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 96);
}

function sanitizeTag(raw: Partial<HydrationIntentTag> | null | undefined): HydrationIntentTag | null {
  if (!raw) {
    return null;
  }
  const key = sanitizeTagKey(raw.key ?? "");
  const value = sanitizeTagValue(raw.value ?? "");
  if (!key || !value) {
    return null;
  }
  const display = sanitizeTagValue(raw.display ?? "");
  return display ? { key, value, display } : { key, value };
}

function dedupeTags(tags: HydrationIntentTag[]): HydrationIntentTag[] {
  const seen = new Set<string>();
  const out: HydrationIntentTag[] = [];
  for (const tag of tags) {
    const normalized = sanitizeTag(tag);
    if (!normalized) {
      continue;
    }
    const key = `${normalized.key}\x1e${normalized.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(normalized);
  }
  return out.slice(0, 6);
}

function renderBranchIntentList(branchIntents: HydrationBranchIntent[]): string {
  if (branchIntents.length === 0) {
    return "(none)";
  }
  return branchIntents.map((intent) => `- ${intent.intent_id}: ${intent.description}`).join("\n");
}

function renderQuestionList(questionSlots: HydrationQuestionSlot[]): string {
  if (questionSlots.length === 0) {
    return "(none)";
  }
  return questionSlots.map((slot) => `- ${slot.id}: ${slot.question}`).join("\n");
}

function buildFallbackQuestionSlots(params: {
  branchIntents: HydrationBranchIntent[];
  maxQuestions: number;
}): HydrationQuestionSlot[] {
  const templates = [
    "Which files, modules, or entrypoints implement or affect this intent: {intent}?",
    "Which exported symbols or declarations are central to this intent: {intent}?",
    "Which callers, dependencies, or surrounding code paths influence this intent: {intent}?",
  ];
  const intents =
    params.branchIntents.length > 0 ?
      params.branchIntents
    : [
        {
          branch_id: "primary",
          intent_id: "intent-1",
          description: "hydrate repository context for current branch intents",
          source_kind: "text" as const,
          source_value: "hydrate repository context for current branch intents",
        },
      ];
  const out: HydrationQuestionSlot[] = [];
  for (const intent of intents) {
    for (const template of templates) {
      if (out.length >= params.maxQuestions) {
        return out;
      }
      const variant = template.replace("{intent}", intent.description);
      out.push({
        id: `q-${out.length + 1}`,
        question: variant,
        strategy: "template",
      });
    }
  }
  return out;
}

function normalizeQuestionSlots(raw: unknown, maxQuestions: number): HydrationQuestionSlot[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const payload = raw as { question_slots?: unknown; slots?: unknown };
  const source =
    Array.isArray(payload.question_slots) ? payload.question_slots
    : Array.isArray(payload.slots) ? payload.slots
    : [];
  const out: HydrationQuestionSlot[] = [];
  const usedIds = new Set<string>();
  for (const entry of source) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const question = typeof record.question === "string" ? record.question.trim() : "";
    if (!question) {
      continue;
    }
    let id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : `q-${out.length + 1}`;
    while (usedIds.has(id)) {
      id = `${id}-${out.length + 1}`;
    }
    usedIds.add(id);
    const strategyRaw = typeof record.strategy === "string" ? record.strategy.trim() : "";
    out.push({
      id,
      question,
      strategy: strategyRaw === "template" ? "template" : "guided-llm-meta",
    });
    if (out.length >= maxQuestions) {
      break;
    }
  }
  return out;
}

export async function planHydrationQuestionSlots(params: {
  repoRoot: string;
  branchIntents: HydrationBranchIntent[];
  downstreamTask: string;
  maxQuestions: number;
  scope?: string;
  promptProfile?: string;
  llmService?: HydrationLlmService | null;
  hydratedContext?: string;
  priorQuestions?: HydrationQuestionSlot[];
  onLlmEvent?: (event: HydrationIntentLlmEvent) => void;
}): Promise<HydrationQuestionSlot[]> {
  const fallback = buildFallbackQuestionSlots({
    branchIntents: params.branchIntents,
    maxQuestions: params.maxQuestions,
  });
  if (!params.llmService) {
    return fallback;
  }

  const prompt = buildGuidedQuestionGenerationPrompt({
    repo_root: params.repoRoot,
    scope: params.scope?.trim() || ".",
    downstream_task: params.downstreamTask,
    branch_intents: renderBranchIntentList(params.branchIntents),
    max_questions: String(params.maxQuestions),
    prior_questions: renderQuestionList(params.priorQuestions ?? []),
    hydrated_context: params.hydratedContext ?? "(none)",
    prompt_profile: params.promptProfile ?? "",
  });
  const request = {
    messages: [
      { role: "system" as const, content: prompt.system },
      { role: "user" as const, content: prompt.user },
    ],
    schemaName: "hydration_question_plan",
    schemaDescription: QUESTION_PLAN_SCHEMA_DESCRIPTION,
  };
  params.onLlmEvent?.({
    event: "llm_request",
    schemaName: request.schemaName,
    provider: params.llmService.providerId,
    model: params.llmService.model,
    requestJson: request,
  });
  try {
    const response = await params.llmService.generateJson<{ question_slots?: unknown; slots?: unknown }>(request);
    params.onLlmEvent?.({
      event: "llm_response",
      schemaName: request.schemaName,
      provider: params.llmService.providerId,
      model: params.llmService.model,
      responseJson: response,
    });
    const planned = normalizeQuestionSlots(response, params.maxQuestions);
    return planned.length > 0 ? planned : fallback;
  } catch (error) {
    params.onLlmEvent?.({
      event: "llm_error",
      schemaName: request.schemaName,
      provider: params.llmService.providerId,
      model: params.llmService.model,
      note: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

function scoreEvidencePaths(retrievalBundles: HydrationRetrievalBundle[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const bundle of retrievalBundles) {
    for (const hit of bundle.vector_hits) {
      scores.set(hit.path, (scores.get(hit.path) ?? 0) + Math.max(0.01, hit.score));
    }
    for (const candidate of bundle.ast_candidates) {
      scores.set(candidate.path, (scores.get(candidate.path) ?? 0) + Math.max(0.01, candidate.score * 0.5));
    }
  }
  return scores;
}

function rankEvidencePaths(retrievalBundles: HydrationRetrievalBundle[]): string[] {
  return [...scoreEvidencePaths(retrievalBundles).entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([filePath]) => filePath);
}

export function buildHydrationFuzzyAlignment(params: {
  retrievalBundles: HydrationRetrievalBundle[];
  retrievalMerge: HydrationRetrievalMerge;
}): HydrationFuzzyAlignmentCandidate[] {
  const rankedPaths = Array.from(
    new Set([
      ...rankEvidencePaths(params.retrievalBundles),
      ...params.retrievalMerge.evidence_by_path.map((entry) => entry.path),
    ]),
  );
  const pathRank = new Map<string, number>();
  rankedPaths.forEach((filePath, index) => pathRank.set(filePath, index));

  const aggregated = new Map<string, HydrationFuzzyAlignmentCandidate>();
  for (const bundle of params.retrievalBundles) {
    const questionTokens = tokenize(bundle.question);
    for (const candidate of bundle.ast_candidates) {
      const samePathHits = bundle.vector_hits.filter((hit) => hit.path === candidate.path);
      const overlapScore = samePathHits.length === 0 ? 0 : Math.min(1, samePathHits.length / Math.max(1, bundle.vector_hits.length));
      const candidateTokens = tokenize(
        `${candidate.ast_node_id} ${candidate.path} ${candidate.symbol ?? ""} ${candidate.node_kind ?? ""}`,
      );
      const sharedTokenCount = questionTokens.filter((token) => candidateTokens.includes(token)).length;
      const tokenScore = questionTokens.length === 0 ? 0 : Math.min(1, sharedTokenCount / questionTokens.length);
      const rankIndex = pathRank.get(candidate.path) ?? rankedPaths.length;
      const denominator = Math.max(1, rankedPaths.length);
      const pathDistanceScore = Math.max(0, 1 - rankIndex / denominator);
      const score =
        (candidate.score * 0.45)
        + (overlapScore * 0.3)
        + (tokenScore * 0.15)
        + (pathDistanceScore * 0.1);
      const existing = aggregated.get(candidate.ast_node_id);
      if (!existing || score > existing.score) {
        aggregated.set(candidate.ast_node_id, {
          ast_node_id: candidate.ast_node_id,
          path: candidate.path,
          score: Number(score.toFixed(6)),
          overlap_score: Number(overlapScore.toFixed(6)),
          token_score: Number(tokenScore.toFixed(6)),
          path_distance_score: Number(pathDistanceScore.toFixed(6)),
        });
      }
    }
  }
  for (const evidence of params.retrievalMerge.evidence_by_path) {
    if (evidence.ast_node_ids.length > 0) {
      continue;
    }
    const existing = aggregated.get(`span:${evidence.path}:0:0`);
    if (existing) {
      continue;
    }
    const slotScore = Math.min(1, evidence.slot_ids.length / Math.max(1, params.retrievalBundles.length));
    const chunkScore = Math.min(1, evidence.chunk_ids.length / Math.max(1, evidence.chunk_ids.length + 1));
    aggregated.set(`span:${evidence.path}:0:0`, {
      ast_node_id: `span:${evidence.path}:0:0`,
      path: evidence.path,
      score: Number(((slotScore * 0.6) + (chunkScore * 0.4)).toFixed(6)),
      overlap_score: Number(slotScore.toFixed(6)),
      token_score: 0,
      path_distance_score: Number(chunkScore.toFixed(6)),
    });
  }
  return [...aggregated.values()]
    .sort((left, right) => right.score - left.score || left.ast_node_id.localeCompare(right.ast_node_id))
    .slice(0, 12);
}

export function buildHydrationCycleState(params: {
  branchIntents: HydrationBranchIntent[];
  retrievalMerge: HydrationRetrievalMerge;
  fuzzyAlignment: HydrationFuzzyAlignmentCandidate[];
}): HydrationCycleState {
  const targets: Array<{
    target_id: string;
    level: HydrationCycleNode["level"];
    label: string;
    path?: string;
    symbol?: string;
    source_node_ids: string[];
  }> = [];
  for (const intent of params.branchIntents) {
    targets.push({
      target_id: `branch:${intent.intent_id}`,
      level: "branch",
      label: sentenceCase(intent.description),
      source_node_ids: [],
    });
  }
  for (const evidence of params.retrievalMerge.evidence_by_path.slice(0, 8)) {
    targets.push({
      target_id: `module:${evidence.path}`,
      level: "module",
      label: evidence.path,
      path: evidence.path,
      source_node_ids: [],
    });
  }
  for (const candidate of params.fuzzyAlignment.slice(0, 8)) {
    const symbol = extractHydrationCandidateSymbol(candidate);
    targets.push({
      target_id: candidate.ast_node_id,
      level: inferHydrationCandidateNodeKind(candidate),
      label: symbol || candidate.ast_node_id,
      path: candidate.path,
      symbol: symbol || undefined,
      source_node_ids: [candidate.ast_node_id],
    });
  }
  const cycleRecord = buildHydrationCycleRecord({
    cycleNumber: 1,
    targets,
    questionSlots: [],
    retrievalBundles: params.retrievalMerge.retrieval_bundles,
    retrievalMerge: params.retrievalMerge,
    fuzzyAlignment: params.fuzzyAlignment,
  });
  return buildFinalHydrationCycleState({
    cycles: [cycleRecord],
    stopReason: "max_cycles",
  });
}

function deriveDeterministicTags(params: {
  branchIntents: HydrationBranchIntent[];
  metadataConsolidation?: HydrationMetadataConsolidation;
}): HydrationTagSynthesis {
  const primaryIntent = params.branchIntents[0]?.description ?? "hydrate repository context";
  const topPath = params.metadataConsolidation?.paths_ranked[0]?.path ?? "";
  const topSymbol = params.metadataConsolidation?.symbols_ranked[0]?.symbol ?? "";
  const tags = dedupeTags([
    {
      key: "intent",
      value: slugify(primaryIntent, 48),
      display: primaryIntent.slice(0, 96),
    },
    topPath ? { key: "path", value: topPath } : null,
    topSymbol ? { key: "symbol", value: topSymbol } : null,
  ].filter((entry): entry is HydrationIntentTag => Boolean(entry)));
  const rationaleParts = [`Primary intent '${primaryIntent}'`];
  if (topPath) {
    rationaleParts.push(`clusters in ${topPath}`);
  }
  if (topSymbol) {
    rationaleParts.push(`around ${topSymbol}`);
  }
  return {
    tagsAdded: tags,
    rationale: `${rationaleParts.join(" ")}.`.replace(/\s+\./g, "."),
  };
}

function normalizeSynthesisTags(raw: unknown): HydrationIntentTag[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return dedupeTags(
    raw
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const record = entry as Record<string, unknown>;
        return sanitizeTag({
          key: typeof record.key === "string" ? record.key : "",
          value: typeof record.value === "string" ? record.value : "",
          display: typeof record.display === "string" ? record.display : "",
        });
      })
      .filter((entry): entry is HydrationIntentTag => Boolean(entry)),
  );
}

export async function synthesizeHydrationMetadata(params: {
  repoRoot: string;
  branchIntents: HydrationBranchIntent[];
  questionSlots: HydrationQuestionSlot[];
  metadataConsolidation: HydrationMetadataConsolidation;
  retrievalBundles?: HydrationRetrievalBundle[];
  fuzzyAlignment?: HydrationFuzzyAlignmentCandidate[];
  promptProfile?: string;
  llmService?: HydrationLlmService | null;
  onLlmEvent?: (event: HydrationIntentLlmEvent) => void;
}): Promise<HydrationTagSynthesis> {
  const fallback = deriveDeterministicTags(params);
  if (!params.llmService) {
    return fallback;
  }

  const primaryPath = params.metadataConsolidation.paths_ranked[0]?.path ?? ".";
  const prompt = buildHydrationSynthesisPrompt({
    repo_root: params.repoRoot,
    path: primaryPath,
    intent_spec: renderBranchIntentList(params.branchIntents),
    question_slots: JSON.stringify(params.questionSlots, null, 2),
    retrieval_bundles: JSON.stringify(params.retrievalBundles ?? [], null, 2),
    fuzzy_alignment: JSON.stringify(params.fuzzyAlignment ?? [], null, 2),
    metadata_consolidation: JSON.stringify(params.metadataConsolidation, null, 2),
    prompt_profile: params.promptProfile ?? "",
  });
  const request = {
    messages: [
      { role: "system" as const, content: prompt.system },
      { role: "user" as const, content: prompt.user },
    ],
    schemaName: "hydration_metadata_synthesis",
    schemaDescription: SYNTHESIS_SCHEMA_DESCRIPTION,
  };
  params.onLlmEvent?.({
    event: "llm_request",
    schemaName: request.schemaName,
    provider: params.llmService.providerId,
    model: params.llmService.model,
    requestJson: request,
  });
  try {
    const response = await params.llmService.generateJson<{ tags?: unknown; rationale?: unknown }>(request);
    params.onLlmEvent?.({
      event: "llm_response",
      schemaName: request.schemaName,
      provider: params.llmService.providerId,
      model: params.llmService.model,
      responseJson: response,
    });
    const tagsAdded = normalizeSynthesisTags(response.tags);
    const rationale =
      typeof response.rationale === "string" && response.rationale.trim() ? response.rationale.trim() : fallback.rationale;
    return {
      tagsAdded: tagsAdded.length > 0 ? tagsAdded : fallback.tagsAdded,
      rationale,
    };
  } catch (error) {
    params.onLlmEvent?.({
      event: "llm_error",
      schemaName: request.schemaName,
      provider: params.llmService.providerId,
      model: params.llmService.model,
      note: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

export type {
  HydrationIntentLlmEvent,
  HydrationTagSynthesis,
};
