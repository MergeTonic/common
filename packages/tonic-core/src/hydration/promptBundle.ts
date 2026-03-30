import bundleJson from "./prompts/hydrationPrompts.v1.json";
import conflictBundleJson from "./prompts/conflictPrompts.v1.json";
import agenticBundleJson from "./prompts/agenticPrompts.v1.json";

export type HydrationPromptBundle = {
  schema_version: number;
  question_generation: {
    system: string;
    user: string;
  };
  retrieval_slot_user: string;
  synthesis: {
    system: string;
    user: string;
  };
  profiles?: Record<
    string,
    Partial<{
      question_generation: Partial<HydrationPromptBundle["question_generation"]>;
      retrieval_slot_user: string;
      synthesis: Partial<HydrationPromptBundle["synthesis"]>;
    }>
  >;
};

export type ConflictPromptBundle = {
  schema_version: number;
  github_json_response_suffix: string;
  system_prompts: Record<"default" | "enhanced" | "context_aware", string>;
  conflict_user: Record<"default" | "enhanced" | "context_aware", string>;
  file_user: Record<"default" | "enhanced" | "context_aware", string>;
};

export type AgenticPromptSection = {
  generate_plan: string;
  execute_step_system: string;
  execute_step_user: string;
  finalize_step: string;
  evaluate_plan_system: string;
  final_answer_system: string;
};

export type AgenticPromptBundle = {
  schema_version: number;
  base: AgenticPromptSection;
  code_search: AgenticPromptSection;
  bcp_search: AgenticPromptSection;
};

export type AgenticPromptContextStep = {
  id: string;
  title: string;
  description?: string;
};

export type AgenticPromptContextHistoryChunk = {
  filePath: string;
  symbol?: string;
  snippet: string;
};

export type AgenticPromptContextHistory = {
  stepId: string;
  summary: string;
  chunks?: AgenticPromptContextHistoryChunk[];
  insights?: string[];
  evidence?: string[];
  candidateAnswers?: string | string[];
};

export type AgenticPromptContext = {
  query: string;
  plan: AgenticPromptContextStep[];
  history: AgenticPromptContextHistory[];
};

const bundle = bundleJson as HydrationPromptBundle;
const conflictBundle = conflictBundleJson as ConflictPromptBundle;
const agenticBundle = agenticBundleJson as AgenticPromptBundle;

function resolveHydrationPromptProfile(profileName?: string): HydrationPromptBundle {
  const name = (profileName ?? "").trim();
  const selected = name || "default";
  const profile = bundle.profiles?.[selected];
  if (selected !== "default" && !profile) {
    throw new Error(
      `Unknown hydration prompt profile '${selected}'. Available profiles: ${Object.keys(bundle.profiles ?? { default: true }).join(", ")}`,
    );
  }
  if (!profile) {
    return {
      schema_version: bundle.schema_version,
      question_generation: bundle.question_generation,
      retrieval_slot_user: bundle.retrieval_slot_user,
      synthesis: bundle.synthesis,
      profiles: bundle.profiles,
    };
  }
  return {
    schema_version: bundle.schema_version,
    question_generation: {
      system: profile.question_generation?.system ?? bundle.question_generation.system,
      user: profile.question_generation?.user ?? bundle.question_generation.user,
    },
    retrieval_slot_user: profile.retrieval_slot_user ?? bundle.retrieval_slot_user,
    synthesis: {
      system: profile.synthesis?.system ?? bundle.synthesis.system,
      user: profile.synthesis?.user ?? bundle.synthesis.user,
    },
    profiles: bundle.profiles,
  };
}

export function loadHydrationPrompts(profileName?: string): HydrationPromptBundle {
  return resolveHydrationPromptProfile(profileName);
}

export function loadConflictPrompts(): ConflictPromptBundle {
  return conflictBundle;
}

export function loadAgenticPrompts(): AgenticPromptBundle {
  return agenticBundle;
}

export function formatAgenticPromptTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : `{${key}}`,
  );
}

export function formatHydrationPromptTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : `{${key}}`,
  );
}

function renderPlan(plan: AgenticPromptContextStep[]): string {
  return plan.map((step) => `${step.id}: ${step.title}`).join("\n");
}

function renderCurrentStep(step?: AgenticPromptContextStep): string {
  if (!step) {
    return "";
  }
  const description = step.description?.trim();
  return description ?
      `The current step:\n${step.id}: ${step.title}\n${description}\n`
    : `The current step:\n${step.id}: ${step.title}\n`;
}

function renderBaseHistory(history: AgenticPromptContextHistory[]): string {
  if (history.length === 0) {
    return "";
  }
  return history.map((entry) => `Step ${entry.stepId}\n${entry.summary}`).join("\n\n");
}

function renderCodeSearchHistory(history: AgenticPromptContextHistory[]): string {
  if (history.length === 0) {
    return "";
  }
  return history
    .map((entry) => {
      const parts = [`Step ${entry.stepId}`, entry.summary];
      if (entry.chunks && entry.chunks.length > 0) {
        const chunkSummary = entry.chunks
          .map((chunk) => `  - ${chunk.filePath}${chunk.symbol ? ` (${chunk.symbol})` : ""}\n    ${chunk.snippet}`)
          .join("\n");
        parts.push(`Relevant code:\n${chunkSummary}`);
      }
      if (entry.insights && entry.insights.length > 0) {
        parts.push(`Insights: ${entry.insights.join("; ")}`);
      }
      return parts.join("\n");
    })
    .join("\n\n");
}

function renderBcpHistory(history: AgenticPromptContextHistory[]): string {
  if (history.length === 0) {
    return "";
  }
  return history
    .map((entry) => {
      const parts = [`Step ${entry.stepId}`, entry.summary];
      if (entry.evidence && entry.evidence.length > 0) {
        parts.push(`Evidence: ${entry.evidence.join(", ")}`);
      }
      if (entry.candidateAnswers) {
        const candidateText =
          Array.isArray(entry.candidateAnswers) ?
            entry.candidateAnswers.join(", ")
          : entry.candidateAnswers;
        parts.push(`Candidate answers: ${candidateText}`);
      }
      return parts.join("\n");
    })
    .join("\n\n");
}

function formatExecuteStepUser(section: AgenticPromptSection, args: {
  context: AgenticPromptContext;
  step?: AgenticPromptContextStep;
  historyText?: string;
  queryOverride?: string;
}): string {
  const historyBody = args.historyText ?? "";
  return formatAgenticPromptTemplate(section.execute_step_user, {
    query: args.queryOverride ?? args.context.query,
    plan: renderPlan(args.context.plan),
    current_step: renderCurrentStep(args.step),
    history: historyBody ? `What we discovered so far:\n${historyBody}` : "",
  });
}

export function buildBaseAgenticExecuteStepUserPrompt(args: {
  context: AgenticPromptContext;
  step?: AgenticPromptContextStep;
  queryOverride?: string;
}): string {
  const bundle = loadAgenticPrompts();
  return formatExecuteStepUser(bundle.base, {
    context: args.context,
    step: args.step,
    queryOverride: args.queryOverride,
    historyText: renderBaseHistory(args.context.history),
  });
}

export function buildCodeSearchExecuteStepUserPrompt(args: {
  context: AgenticPromptContext;
  step?: AgenticPromptContextStep;
  queryOverride?: string;
}): string {
  const bundle = loadAgenticPrompts();
  return formatExecuteStepUser(bundle.code_search, {
    context: args.context,
    step: args.step,
    queryOverride: args.queryOverride,
    historyText: renderCodeSearchHistory(args.context.history),
  });
}

export function buildBcpExecuteStepUserPrompt(args: {
  context: AgenticPromptContext;
  step?: AgenticPromptContextStep;
  queryOverride?: string;
}): string {
  const bundle = loadAgenticPrompts();
  return formatExecuteStepUser(bundle.bcp_search, {
    context: args.context,
    step: args.step,
    queryOverride: args.queryOverride,
    historyText: renderBcpHistory(args.context.history),
  });
}

export function buildGuidedQuestionGenerationPrompt(vars: {
  repo_root: string;
  scope: string;
  downstream_task: string;
  branch_intents: string;
  max_questions: string;
  prior_questions?: string;
  hydrated_context?: string;
  prompt_profile?: string;
}): { system: string; user: string } {
  const prompts = loadHydrationPrompts(vars.prompt_profile);
  return {
    system: prompts.question_generation.system,
    user: formatHydrationPromptTemplate(prompts.question_generation.user, {
      repo_root: vars.repo_root,
      scope: vars.scope,
      downstream_task: vars.downstream_task,
      branch_intents: vars.branch_intents,
      max_questions: vars.max_questions,
      prior_questions: vars.prior_questions ?? "(none)",
      hydrated_context: vars.hydrated_context ?? "(none)",
    }),
  };
}

export function buildHydrationSynthesisPrompt(vars: {
  repo_root: string;
  path: string;
  intent_spec: string;
  question_slots: string;
  retrieval_bundles: string;
  fuzzy_alignment: string;
  metadata_consolidation: string;
  prompt_profile?: string;
}): { system: string; user: string } {
  const prompts = loadHydrationPrompts(vars.prompt_profile);
  return {
    system: prompts.synthesis.system,
    user: formatHydrationPromptTemplate(prompts.synthesis.user, vars),
  };
}
