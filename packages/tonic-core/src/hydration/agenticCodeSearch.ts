import { createHash } from "node:crypto";

import type { Embedder } from "./embedder";
import type { HydrationLlmService } from "./llmService";
import type { HydrationSearchMiddleware } from "./middleware";
import { runHydrationToolWithMiddleware } from "./middleware";
import {
  buildCodeSearchExecuteStepUserPrompt,
  formatAgenticPromptTemplate,
  loadAgenticPrompts,
  type AgenticPromptContext,
} from "./promptBundle";
import { HydrationRepository } from "./repository";
import {
  extractRegexCandidates,
  extractSymbolCandidates,
  getFileContent,
  hybridSearchRecords,
  listFiles,
  mergeSearchRecords,
  regexSearchRecords,
  symbolSearchRecords,
  type CodeSearchRecord,
} from "./searchTools";
import type { VectorIndex } from "./vectorIndex";

export type AgenticCodeSearchStepStatus =
  | "pending"
  | "in_progress"
  | "success"
  | "failure"
  | "cancelled"
  | "timeout";

export type AgenticCodeSearchStepKind =
  | "semantic"
  | "hybrid"
  | "symbol"
  | "regex"
  | "list_files"
  | "finalize";

export type AgenticCodeSearchStep = {
  id: string;
  title: string;
  description: string;
  kind: AgenticCodeSearchStepKind;
  status: AgenticCodeSearchStepStatus;
  parents: string[] | null;
  symbolCandidates?: string[];
  regexCandidates?: string[];
};

export type AgenticCodeSearchChunk = {
  filePath: string;
  snippet: string;
  symbol?: string;
  relevance: number;
};

export type AgenticCodeSearchOutcome = {
  stepId: string;
  status: AgenticCodeSearchStepStatus;
  summary: string;
  chunks: AgenticCodeSearchChunk[];
  insights: string[];
};

export type AgenticCodeSearchSession = {
  query: string;
  plan: AgenticCodeSearchStep[];
  outcomes: AgenticCodeSearchOutcome[];
  records: CodeSearchRecord[];
  answer: string;
  answerReason?: string;
};

export type AgenticCodeSearchLlmEvent = {
  event: "llm_request" | "llm_response" | "llm_error";
  schemaName: string;
  provider?: string;
  model?: string;
  requestJson?: unknown;
  responseJson?: unknown;
  note?: string;
};

export type RunAgenticCodeSearchSessionParams = {
  query: string;
  repository: HydrationRepository;
  index: VectorIndex;
  embedder: Embedder;
  llmService?: HydrationLlmService | null;
  onLlmEvent?: (event: AgenticCodeSearchLlmEvent) => void;
  middleware?: HydrationSearchMiddleware;
  topK?: number;
  maxPlanSize?: number;
  maxStepIterations?: number;
};

function toChunk(record: CodeSearchRecord): AgenticCodeSearchChunk {
  const snippet = record.code.length > 400 ? `${record.code.slice(0, 400)}...` : record.code;
  return {
    filePath: record.filePath,
    snippet,
    symbol: record.symbol,
    relevance: Math.max(0, Math.min(1, record.score)),
  };
}

function makeSummary(kind: AgenticCodeSearchStepKind, records: CodeSearchRecord[], extra = ""): string {
  const byPath = new Set(records.map((record) => record.filePath));
  const base = `${kind} search returned ${records.length} records across ${byPath.size} files.`;
  return extra ? `${base} ${extra}` : base;
}

function syntheticChunkId(parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("\x1e"), "utf8").digest("hex").slice(0, 16);
  return `synthetic:${digest}`;
}

function uniquePaths(records: CodeSearchRecord[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const record of records) {
    if (seen.has(record.filePath)) {
      continue;
    }
    seen.add(record.filePath);
    out.push(record.filePath);
  }
  return out;
}

function buildPlan(query: string, params: {
  maxPlanSize: number;
  topK: number;
}): AgenticCodeSearchStep[] {
  const symbolCandidates = extractSymbolCandidates(query, Math.max(1, Math.min(4, params.topK)));
  const regexCandidates = extractRegexCandidates(query, Math.max(1, Math.min(3, params.topK)));
  const steps: AgenticCodeSearchStep[] = [
    {
      id: "step-semantic",
      title: "Map relevant code with semantic retrieval",
      description: "Run semantic retrieval to identify likely entrypoints before targeted searches.",
      kind: "semantic",
      status: "pending",
      parents: null,
    },
  ];
  if (symbolCandidates.length > 0 && steps.length < params.maxPlanSize - 1) {
    steps.push({
      id: "step-symbol",
      title: "Resolve symbol declarations",
      description: "Search for direct symbol declarations to improve structural precision.",
      kind: "symbol",
      status: "pending",
      parents: ["step-semantic"],
      symbolCandidates,
    });
  }
  if (regexCandidates.length > 0 && steps.length < params.maxPlanSize - 1) {
    steps.push({
      id: "step-regex",
      title: "Run lexical/regex confirmation",
      description: "Use lexical patterns to verify exact matches for critical phrases.",
      kind: "regex",
      status: "pending",
      parents: ["step-semantic"],
      regexCandidates,
    });
  }
  if (steps.length < params.maxPlanSize - 1) {
    steps.push({
      id: "step-files",
      title: "Read file-level context",
      description: "List files and pull direct file context for high-signal paths.",
      kind: "list_files",
      status: "pending",
      parents: steps.map((step) => step.id),
    });
  }
  steps.push({
    id: "step-finalize",
    title: "Finalize findings",
    description: "Consolidate evidence into a final, code-grounded answer.",
    kind: "finalize",
    status: "pending",
    parents: steps.map((step) => step.id),
  });
  return steps.slice(0, params.maxPlanSize);
}

function cloneStep(step: AgenticCodeSearchStep): AgenticCodeSearchStep {
  return {
    ...step,
    parents: step.parents ? [...step.parents] : null,
    symbolCandidates: step.symbolCandidates ? [...step.symbolCandidates] : undefined,
    regexCandidates: step.regexCandidates ? [...step.regexCandidates] : undefined,
  };
}

function appendOverridePlanSteps(params: {
  plan: AgenticCodeSearchStep[];
  steps: AgenticCodeSearchStep[];
}): void {
  const usedIds = new Set(params.plan.map((step) => step.id));
  for (const rawStep of params.steps) {
    let nextId = rawStep.id;
    let suffix = 1;
    while (usedIds.has(nextId)) {
      suffix += 1;
      nextId = `${rawStep.id}-${suffix}`;
    }
    usedIds.add(nextId);
    params.plan.push({
      ...cloneStep(rawStep),
      id: nextId,
      status: "pending",
    });
  }
}

function toPromptContext(
  query: string,
  plan: AgenticCodeSearchStep[],
  outcomes: AgenticCodeSearchOutcome[],
): AgenticPromptContext {
  return {
    query,
    plan: plan.map((step) => ({
      id: step.id,
      title: step.title,
      description: step.description,
    })),
    history: outcomes.map((outcome) => ({
      stepId: outcome.stepId,
      summary: outcome.summary,
      chunks: outcome.chunks.map((chunk) => ({
        filePath: chunk.filePath,
        symbol: chunk.symbol,
        snippet: chunk.snippet,
      })),
      insights: outcome.insights,
    })),
  };
}

function normalizePlanSteps(raw: unknown, fallbackMax: number): AgenticCodeSearchStep[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }
  const stepsValue = (raw as { steps?: unknown }).steps;
  if (!Array.isArray(stepsValue)) {
    return [];
  }
  const out: AgenticCodeSearchStep[] = [];
  const knownIds = new Set<string>();
  for (let i = 0; i < stepsValue.length && out.length < fallbackMax; i++) {
    const item = stepsValue[i];
    if (!item || typeof item !== "object") {
      continue;
    }
    const step = item as Record<string, unknown>;
    const title = typeof step.title === "string" ? step.title.trim() : "";
    const description = typeof step.description === "string" ? step.description.trim() : "";
    if (!title) {
      continue;
    }
    const idBase = typeof step.id === "string" && step.id.trim() ? step.id.trim() : `llm-step-${i + 1}`;
    const id = knownIds.has(idBase) ? `${idBase}-${i + 1}` : idBase;
    knownIds.add(id);
    const kindRaw = typeof step.kind === "string" ? step.kind.trim().toLowerCase() : "";
    const kind: AgenticCodeSearchStepKind =
      kindRaw === "symbol" || kindRaw === "regex" || kindRaw === "list_files" || kindRaw === "finalize" || kindRaw === "hybrid" ?
        (kindRaw as AgenticCodeSearchStepKind)
      : "semantic";
    const parents = Array.isArray(step.parents) ?
        step.parents.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : null;
    out.push({
      id,
      title,
      description: description || title,
      kind,
      status: "pending",
      parents,
      symbolCandidates:
        Array.isArray(step.symbolCandidates) ?
          step.symbolCandidates.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : undefined,
      regexCandidates:
        Array.isArray(step.regexCandidates) ?
          step.regexCandidates.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : undefined,
    });
  }
  return out;
}

function normalizeEvaluation(raw: unknown): {
  decision: "continue" | "break" | "override";
  steps: AgenticCodeSearchStep[];
} {
  if (!raw || typeof raw !== "object") {
    return { decision: "continue", steps: [] };
  }
  const payload = raw as { decision?: unknown; steps?: unknown; planOverride?: unknown };
  const decisionRaw = typeof payload.decision === "string" ? payload.decision.trim().toLowerCase() : "";
  const decision =
    decisionRaw === "break" || decisionRaw === "override" ? decisionRaw
    : "continue";
  const overrideSteps =
    Array.isArray(payload.steps) ? payload.steps
    : Array.isArray(payload.planOverride) ? payload.planOverride
    : [];
  const steps = normalizePlanSteps(
    { steps: overrideSteps },
    6,
  );
  return { decision, steps };
}

async function maybeGeneratePlanWithLlm(params: {
  query: string;
  maxPlanSize: number;
  llmService?: HydrationLlmService | null;
  onLlmEvent?: (event: AgenticCodeSearchLlmEvent) => void;
}): Promise<AgenticCodeSearchStep[] | null> {
  if (!params.llmService) {
    return null;
  }
  const prompts = loadAgenticPrompts().code_search;
  const system = formatAgenticPromptTemplate(prompts.generate_plan, {
    initial_plan_size: String(Math.min(4, params.maxPlanSize)),
    max_query_plan_size: String(params.maxPlanSize),
  });
  const request = {
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: params.query },
    ],
    schemaName: "hydration_code_search_plan",
    schemaDescription:
      '{"steps":[{"id":"string","title":"string","description":"string","kind":"semantic|hybrid|symbol|regex|list_files|finalize","parents":["step-id"],"symbolCandidates":["string"],"regexCandidates":["string"]}]}',
  };
  params.onLlmEvent?.({
    event: "llm_request",
    schemaName: request.schemaName,
    provider: params.llmService.providerId,
    model: params.llmService.model,
    requestJson: request,
  });
  try {
    const response = await params.llmService.generateJson<{ steps?: unknown }>(request);
    params.onLlmEvent?.({
      event: "llm_response",
      schemaName: request.schemaName,
      provider: params.llmService.providerId,
      model: params.llmService.model,
      responseJson: response,
    });
    const steps = normalizePlanSteps(response, params.maxPlanSize);
    return steps.length > 0 ? steps : null;
  } catch (error) {
    params.onLlmEvent?.({
      event: "llm_error",
      schemaName: request.schemaName,
      provider: params.llmService.providerId,
      model: params.llmService.model,
      note: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function maybeEvaluatePlanWithLlm(params: {
  query: string;
  maxPlanSize: number;
  plan: AgenticCodeSearchStep[];
  outcomes: AgenticCodeSearchOutcome[];
  llmService?: HydrationLlmService | null;
  onLlmEvent?: (event: AgenticCodeSearchLlmEvent) => void;
}): Promise<{ decision: "continue" | "break" | "override"; steps: AgenticCodeSearchStep[] } | null> {
  if (!params.llmService) {
    return null;
  }
  const prompts = loadAgenticPrompts().code_search;
  const system = formatAgenticPromptTemplate(prompts.evaluate_plan_system, {
    max_new_steps: String(params.maxPlanSize),
  });
  const context = toPromptContext(params.query, params.plan, params.outcomes);
  const user = buildCodeSearchExecuteStepUserPrompt({ context });
  const request = {
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
    schemaName: "hydration_code_search_evaluation",
    schemaDescription:
      '{"decision":"continue|break|override","steps":[{"id":"string","title":"string","description":"string","kind":"semantic|hybrid|symbol|regex|list_files|finalize","parents":["step-id"],"symbolCandidates":["string"],"regexCandidates":["string"]}]}',
  };
  params.onLlmEvent?.({
    event: "llm_request",
    schemaName: request.schemaName,
    provider: params.llmService.providerId,
    model: params.llmService.model,
    requestJson: request,
  });
  try {
    const response = await params.llmService.generateJson<{
      decision?: unknown;
      steps?: unknown;
      planOverride?: unknown;
    }>(request);
    params.onLlmEvent?.({
      event: "llm_response",
      schemaName: request.schemaName,
      provider: params.llmService.providerId,
      model: params.llmService.model,
      responseJson: response,
    });
    return normalizeEvaluation(response);
  } catch (error) {
    params.onLlmEvent?.({
      event: "llm_error",
      schemaName: request.schemaName,
      provider: params.llmService.providerId,
      model: params.llmService.model,
      note: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function maybeSynthesizeAnswerWithLlm(params: {
  query: string;
  plan: AgenticCodeSearchStep[];
  outcomes: AgenticCodeSearchOutcome[];
  llmService?: HydrationLlmService | null;
  onLlmEvent?: (event: AgenticCodeSearchLlmEvent) => void;
}): Promise<{ answer: string; reason?: string } | null> {
  if (!params.llmService) {
    return null;
  }
  const prompts = loadAgenticPrompts().code_search;
  const context = toPromptContext(params.query, params.plan, params.outcomes);
  const user = buildCodeSearchExecuteStepUserPrompt({ context });
  const request = {
    messages: [
      { role: "system" as const, content: prompts.final_answer_system },
      { role: "user" as const, content: user },
    ],
    schemaName: "hydration_code_search_final_answer",
    schemaDescription: '{"answer":"string","reason":"string"}',
  };
  params.onLlmEvent?.({
    event: "llm_request",
    schemaName: request.schemaName,
    provider: params.llmService.providerId,
    model: params.llmService.model,
    requestJson: request,
  });
  try {
    const response = await params.llmService.generateJson<{ answer?: unknown; reason?: unknown }>(request);
    params.onLlmEvent?.({
      event: "llm_response",
      schemaName: request.schemaName,
      provider: params.llmService.providerId,
      model: params.llmService.model,
      responseJson: response,
    });
    const answer = typeof response.answer === "string" ? response.answer.trim() : "";
    const reason = typeof response.reason === "string" ? response.reason.trim() : "";
    return answer ? { answer, reason: reason || undefined } : null;
  } catch (error) {
    params.onLlmEvent?.({
      event: "llm_error",
      schemaName: request.schemaName,
      provider: params.llmService.providerId,
      model: params.llmService.model,
      note: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function executeSemanticStep(params: {
  step: AgenticCodeSearchStep;
  query: string;
  topK: number;
  repository: HydrationRepository;
  index: VectorIndex;
  embedder: Embedder;
  middleware?: HydrationSearchMiddleware;
}): Promise<{ records: CodeSearchRecord[]; outcome: AgenticCodeSearchOutcome }> {
  const records = await runHydrationToolWithMiddleware(
    params.middleware,
    {
      slotId: params.step.id,
      question: params.query,
      toolId: "hybrid_search",
      params: {
        dense_query: params.query,
        sparse_query: params.query,
        dense_weight: 2.0,
        sparse_weight: 1.0,
        num_results: params.topK,
      },
    },
    async () =>
      hybridSearchRecords({
        index: params.index,
        embedder: params.embedder,
        repository: params.repository,
        denseQuery: params.query,
        sparseQuery: params.query,
        denseWeight: 2.0,
        sparseWeight: 1.0,
        numResults: params.topK,
      }),
    (result) => ({ recordCount: result.length }),
  );
  const status: AgenticCodeSearchStepStatus = records.length > 0 ? "success" : "failure";
  return {
    records,
    outcome: {
      stepId: params.step.id,
      status,
      summary: makeSummary("hybrid", records),
      chunks: records.slice(0, params.topK).map(toChunk),
      insights: records.length > 0 ? ["Hybrid retrieval produced initial candidate files."] : ["No hybrid hits found."],
    },
  };
}

async function executeSymbolStep(params: {
  step: AgenticCodeSearchStep;
  query: string;
  topK: number;
  repository: HydrationRepository;
  middleware?: HydrationSearchMiddleware;
}): Promise<{ records: CodeSearchRecord[]; outcome: AgenticCodeSearchOutcome }> {
  const symbols = params.step.symbolCandidates ?? [];
  const batches = await Promise.all(
    symbols.map((symbolName) =>
      runHydrationToolWithMiddleware(
        params.middleware,
        {
          slotId: params.step.id,
          question: params.query,
          toolId: "symbol_search",
          params: { symbol_name: symbolName, num_results: params.topK },
        },
        async () => symbolSearchRecords({ repository: params.repository, symbolName, numResults: params.topK }),
        (result) => ({ recordCount: result.length }),
      ),
    ),
  );
  const records = mergeSearchRecords(batches.flat(), params.topK);
  const status: AgenticCodeSearchStepStatus = records.length > 0 ? "success" : "failure";
  return {
    records,
    outcome: {
      stepId: params.step.id,
      status,
      summary: makeSummary("symbol", records, symbols.length > 0 ? `Symbols: ${symbols.join(", ")}` : ""),
      chunks: records.slice(0, params.topK).map(toChunk),
      insights:
        records.length > 0 ?
          ["Symbol retrieval narrowed evidence to declaration-level spans."]
        : ["No symbol declaration matched extracted candidates."],
    },
  };
}

async function executeRegexStep(params: {
  step: AgenticCodeSearchStep;
  query: string;
  topK: number;
  repository: HydrationRepository;
  middleware?: HydrationSearchMiddleware;
}): Promise<{ records: CodeSearchRecord[]; outcome: AgenticCodeSearchOutcome }> {
  const patterns = params.step.regexCandidates ?? [];
  const batches = await Promise.all(
    patterns.map((pattern) =>
      runHydrationToolWithMiddleware(
        params.middleware,
        {
          slotId: params.step.id,
          question: params.query,
          toolId: "regex_search",
          params: { pattern, num_results: params.topK },
        },
        async () => regexSearchRecords({ repository: params.repository, pattern, numResults: params.topK }),
        (result) => ({ recordCount: result.length }),
      ),
    ),
  );
  const records = mergeSearchRecords(batches.flat(), params.topK);
  const status: AgenticCodeSearchStepStatus = records.length > 0 ? "success" : "failure";
  return {
    records,
    outcome: {
      stepId: params.step.id,
      status,
      summary: makeSummary("regex", records, patterns.length > 0 ? `Patterns: ${patterns.join(", ")}` : ""),
      chunks: records.slice(0, params.topK).map(toChunk),
      insights:
        records.length > 0 ?
          ["Regex retrieval confirmed lexical alignment for candidate code."]
        : ["No lexical matches found for extracted patterns."],
    },
  };
}

async function executeListFilesStep(params: {
  step: AgenticCodeSearchStep;
  query: string;
  topK: number;
  repository: HydrationRepository;
  existingRecords: CodeSearchRecord[];
  middleware?: HydrationSearchMiddleware;
}): Promise<{ records: CodeSearchRecord[]; outcome: AgenticCodeSearchOutcome }> {
  const allFiles = await runHydrationToolWithMiddleware(
    params.middleware,
    {
      slotId: params.step.id,
      question: params.query,
      toolId: "list_files",
      params: { max_files: 2000 },
    },
    async () => Promise.resolve(listFiles({ repository: params.repository, maxFiles: 2000 })),
    (result) => ({ recordCount: result.length }),
  );
  const prioritized = uniquePaths(params.existingRecords).filter((entry) => allFiles.includes(entry));
  const fallback = allFiles.slice(0, Math.max(1, Math.min(params.topK, 5)));
  const selectedPaths = (prioritized.length > 0 ? prioritized : fallback).slice(0, Math.max(1, Math.min(params.topK, 5)));
  const records: CodeSearchRecord[] = [];
  for (const filePath of selectedPaths) {
    const content = await runHydrationToolWithMiddleware(
      params.middleware,
      {
        slotId: params.step.id,
        question: params.query,
        toolId: "get_file",
        params: { file_path: filePath },
      },
      async () => Promise.resolve(getFileContent({ repository: params.repository, filePath })),
      () => ({ recordCount: 1 }),
    );
    if (!content) {
      continue;
    }
    const excerpt = content.split(/\r?\n/).slice(0, 60).join("\n");
    records.push({
      code: excerpt,
      filePath,
      chunkId: syntheticChunkId([params.step.id, filePath]),
      source: "semantic",
      score: 0.45,
      startLine: 1,
      endLine: Math.max(1, excerpt.split(/\r?\n/).length),
    });
  }
  const status: AgenticCodeSearchStepStatus = records.length > 0 ? "success" : "failure";
  return {
    records,
    outcome: {
      stepId: params.step.id,
      status,
      summary: makeSummary("list_files", records, `Selected ${selectedPaths.length} files from repository tree.`),
      chunks: records.map(toChunk),
      insights: [
        `Repository file inventory considered ${allFiles.length} indexable paths.`,
      ],
    },
  };
}

function executeFinalizeStep(params: {
  step: AgenticCodeSearchStep;
  records: CodeSearchRecord[];
  topK: number;
}): { records: CodeSearchRecord[]; outcome: AgenticCodeSearchOutcome } {
  const merged = mergeSearchRecords(params.records, params.topK);
  const paths = uniquePaths(merged);
  return {
    records: [],
    outcome: {
      stepId: params.step.id,
      status: merged.length > 0 ? "success" : "failure",
      summary:
        merged.length > 0 ?
          `Finalized with ${merged.length} prioritized chunks across ${paths.length} files.`
        : "Finalized without concrete retrieval evidence.",
      chunks: merged.slice(0, params.topK).map(toChunk),
      insights:
        merged.length > 0 ?
          [`High-signal files: ${paths.slice(0, 5).join(", ")}`]
        : ["No final evidence to synthesize."],
    },
  };
}

function composeAnswer(query: string, records: CodeSearchRecord[]): string {
  if (records.length === 0) {
    return `No relevant code evidence was found for: ${query}`;
  }
  const merged = mergeSearchRecords(records, 5);
  const paths = uniquePaths(merged).slice(0, 5);
  const symbols = merged.map((record) => record.symbol).filter((value): value is string => Boolean(value));
  const symbolText = symbols.length > 0 ? `Symbols: ${Array.from(new Set(symbols)).slice(0, 8).join(", ")}.` : "";
  return `Evidence points to ${paths.join(", ")}. ${symbolText}`.trim();
}

export async function runAgenticCodeSearchSession(
  params: RunAgenticCodeSearchSessionParams,
): Promise<AgenticCodeSearchSession> {
  const topK = Math.max(1, params.topK ?? 5);
  const maxPlanSize = Math.max(2, params.maxPlanSize ?? 5);
  const maxStepIterations = Math.max(1, params.maxStepIterations ?? 5);
  const plannedSteps =
    await maybeGeneratePlanWithLlm({
      query: params.query,
      maxPlanSize,
      llmService: params.llmService,
      onLlmEvent: params.onLlmEvent,
    }) ?? buildPlan(params.query, { maxPlanSize, topK });
  const plan = plannedSteps.map(cloneStep);
  const outcomes: AgenticCodeSearchOutcome[] = [];
  const collectedRecords: CodeSearchRecord[] = [];
  let iterations = 0;
  let stopRequested = false;

  const completed = (status: AgenticCodeSearchStepStatus): boolean =>
    status === "success" || status === "failure" || status === "cancelled" || status === "timeout";

  while (iterations < maxStepIterations && !stopRequested) {
    const ready = plan.filter((step) => {
      if (step.status !== "pending") {
        return false;
      }
      if (!step.parents || step.parents.length === 0) {
        return true;
      }
      return step.parents.every((parentId) => completed(plan.find((candidate) => candidate.id === parentId)?.status ?? "pending"));
    });
    if (ready.length === 0) {
      break;
    }

    for (const step of ready) {
      step.status = "in_progress";
      let execution:
        | { records: CodeSearchRecord[]; outcome: AgenticCodeSearchOutcome }
        | null = null;
      if (step.kind === "semantic" || step.kind === "hybrid") {
        execution = await executeSemanticStep({
          step,
          query: params.query,
          topK,
          repository: params.repository,
          index: params.index,
          embedder: params.embedder,
          middleware: params.middleware,
        });
      } else if (step.kind === "symbol") {
        execution = await executeSymbolStep({
          step,
          query: params.query,
          topK,
          repository: params.repository,
          middleware: params.middleware,
        });
      } else if (step.kind === "regex") {
        execution = await executeRegexStep({
          step,
          query: params.query,
          topK,
          repository: params.repository,
          middleware: params.middleware,
        });
      } else if (step.kind === "list_files") {
        execution = await executeListFilesStep({
          step,
          query: params.query,
          topK,
          repository: params.repository,
          existingRecords: collectedRecords,
          middleware: params.middleware,
        });
      } else if (step.kind === "finalize") {
        execution = executeFinalizeStep({ step, records: collectedRecords, topK });
      }
      if (!execution) {
        step.status = "failure";
        outcomes.push({
          stepId: step.id,
          status: "failure",
          summary: `Unhandled step kind: ${step.kind}`,
          chunks: [],
          insights: [],
        });
        continue;
      }
      step.status = execution.outcome.status;
      collectedRecords.push(...execution.records);
      outcomes.push(execution.outcome);
    }

    const evaluation = await maybeEvaluatePlanWithLlm({
      query: params.query,
      maxPlanSize,
      plan,
      outcomes,
      llmService: params.llmService,
      onLlmEvent: params.onLlmEvent,
    });
    if (evaluation?.decision === "break") {
      stopRequested = true;
    } else if (evaluation?.decision === "override" && evaluation.steps.length > 0) {
      for (const step of plan) {
        if (step.status === "pending" || step.status === "in_progress") {
          step.status = "cancelled";
        }
      }
      appendOverridePlanSteps({ plan, steps: evaluation.steps.slice(0, maxPlanSize) });
    }

    iterations += 1;
  }

  if (!stopRequested && iterations >= maxStepIterations) {
    for (const step of plan) {
      if (step.status === "pending" || step.status === "in_progress") {
        step.status = "timeout";
        outcomes.push({
          stepId: step.id,
          status: "timeout",
          summary: "Step timed out before execution could complete.",
          chunks: [],
          insights: [],
        });
      }
    }
  } else {
    for (const step of plan) {
      if (step.status === "pending" || step.status === "in_progress") {
        step.status = "cancelled";
      }
    }
  }

  const records = mergeSearchRecords(collectedRecords, Math.max(topK, topK * 2));
  const synthesized =
    await maybeSynthesizeAnswerWithLlm({
      query: params.query,
      plan,
      outcomes,
      llmService: params.llmService,
      onLlmEvent: params.onLlmEvent,
    });
  return {
    query: params.query,
    plan,
    outcomes,
    records,
    answer: synthesized?.answer ?? composeAnswer(params.query, records),
    answerReason: synthesized?.reason,
  };
}
