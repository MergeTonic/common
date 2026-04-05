import * as fs from "node:fs";

export type QuestionRefinementMode = "off" | "improver" | "subquestions";
export type QuestionRefinementContext = "minimal" | "progressive";

export type HydrationConfigFile = {
  question_mode?: QuestionRefinementMode;
  question_refinement_context?: QuestionRefinementContext;
  strict_llm?: boolean;
  llm_model?: string;
  llm_base_url?: string;
  openai_api_key_env?: string;
  /** When false, omit json_object response_format for chat completions. */
  llm_json_object?: boolean;
};

export type ResolvedHydrationConfig = {
  questionMode: QuestionRefinementMode;
  refinementContext: QuestionRefinementContext;
  strictLlm: boolean;
  llmModel: string;
  llmBaseUrl: string;
  openaiApiKeyEnv: string;
  llmJsonObject: boolean;
};

const defaults: ResolvedHydrationConfig = {
  questionMode: "off",
  refinementContext: "minimal",
  strictLlm: false,
  llmModel: "gpt-4o-mini",
  llmBaseUrl: "https://api.openai.com/v1",
  openaiApiKeyEnv: "OPENAI_API_KEY",
  llmJsonObject: true,
};

export function loadHydrationConfigFile(filePath: string | undefined): Partial<HydrationConfigFile> {
  if (!filePath?.trim()) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const ext = filePath.toLowerCase();
  if (ext.endsWith(".json")) {
    return JSON.parse(raw) as HydrationConfigFile;
  }
  // Minimal YAML subset: key: value lines (no nested objects required for v1)
  const out: HydrationConfigFile = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (!m) {
      continue;
    }
    const k = m[1]!;
    const v = m[2]!.replace(/^["']|["']$/g, "").trim();
    if (k === "question_mode" && (v === "off" || v === "improver" || v === "subquestions")) {
      out.question_mode = v;
    }
    if (k === "question_refinement_context" && (v === "minimal" || v === "progressive")) {
      out.question_refinement_context = v;
    }
    if (k === "strict_llm") {
      out.strict_llm = v === "true" || v === "1" || v === "yes";
    }
    if (k === "llm_model") {
      out.llm_model = v;
    }
    if (k === "llm_base_url") {
      out.llm_base_url = v;
    }
    if (k === "openai_api_key_env") {
      out.openai_api_key_env = v;
    }
    if (k === "llm_json_object") {
      const b = parseYamlBool(v);
      if (b !== undefined) {
        out.llm_json_object = b;
      }
    }
  }
  return out;
}

function parseYamlBool(v: string): boolean | undefined {
  if (v === "true" || v === "1" || v === "yes") {
    return true;
  }
  if (v === "false" || v === "0" || v === "no") {
    return false;
  }
  return undefined;
}

export function mergeHydrationConfig(
  base: ResolvedHydrationConfig,
  file: Partial<HydrationConfigFile>,
  env: NodeJS.ProcessEnv,
  cli: Partial<ResolvedHydrationConfig>,
): ResolvedHydrationConfig {
  const envMode = env.TONIC_QUESTION_MODE?.trim();
  let questionMode = cli.questionMode ?? base.questionMode;
  if (file.question_mode) {
    questionMode = file.question_mode;
  }
  if (envMode === "off" || envMode === "improver" || envMode === "subquestions") {
    questionMode = envMode;
  }
  if (cli.questionMode) {
    questionMode = cli.questionMode;
  }

  const envJson = env.TONIC_LLM_JSON_OBJECT?.trim().toLowerCase();
  let llmJsonObject = cli.llmJsonObject ?? base.llmJsonObject;
  if (typeof file.llm_json_object === "boolean") {
    llmJsonObject = file.llm_json_object;
  }
  if (envJson === "0" || envJson === "false" || envJson === "no" || envJson === "off") {
    llmJsonObject = false;
  }
  if (envJson === "1" || envJson === "true" || envJson === "yes" || envJson === "on") {
    llmJsonObject = true;
  }
  if (cli.llmJsonObject !== undefined) {
    llmJsonObject = cli.llmJsonObject;
  }

  return {
    questionMode,
    refinementContext:
      cli.refinementContext ??
      (file.question_refinement_context === "progressive" ? "progressive" : base.refinementContext),
    strictLlm: cli.strictLlm ?? file.strict_llm ?? base.strictLlm,
    llmModel: cli.llmModel ?? file.llm_model ?? base.llmModel,
    llmBaseUrl: cli.llmBaseUrl ?? file.llm_base_url ?? base.llmBaseUrl,
    openaiApiKeyEnv: cli.openaiApiKeyEnv ?? file.openai_api_key_env ?? base.openaiApiKeyEnv,
    llmJsonObject,
  };
}

export function resolveHydrationConfig(
  configPath: string | undefined,
  env: NodeJS.ProcessEnv,
  cliOverrides: Partial<ResolvedHydrationConfig>,
): ResolvedHydrationConfig {
  const file = loadHydrationConfigFile(configPath);
  return mergeHydrationConfig(defaults, file, env, cliOverrides);
}
