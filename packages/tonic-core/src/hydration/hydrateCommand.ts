import * as path from "node:path";

import { parseHydratePhase } from "./hydrationPhase";
import { runHydrationPipeline, type HydrateCliOptions } from "./pipeline";

function getArg(argv: string[], names: string[], def: string): string {
  for (const n of names) {
    const i = argv.indexOf(n);
    if (i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("-")) {
      return argv[i + 1]!;
    }
  }
  return def;
}

function hasFlag(argv: string[], names: string[]): boolean {
  return names.some((n) => argv.includes(n));
}

export function parseHydrateArgv(argv: string[]): { ok: true; opts: HydrateCliOptions } | { ok: false; message: string } {
  const repo = path.resolve(getArg(argv, ["--repo", "-R"], "."));
  const outDir = path.resolve(getArg(argv, ["--out-dir"], path.join(repo, ".tonic", "hydrate-out")));
  const hydrationConfigPath = getArg(argv, ["--hydration-config"], "");
  const leftIntent = getArg(argv, ["--left-intent"], "");
  const rightIntent = getArg(argv, ["--right-intent"], "");
  const intentPair = getArg(argv, ["--intent-pair"], "");
  const intentProfile = getArg(argv, ["--intent-profile"], "");
  const qm = getArg(argv, ["--question-mode"], "").toLowerCase();
  let questionModeCli: "off" | "improver" | "subquestions" | undefined;
  if (qm === "off" || qm === "improver" || qm === "subquestions") {
    questionModeCli = qm;
  }
  const strictLlm = hasFlag(argv, ["--strict-llm"]);
  const llmModel = getArg(argv, ["--llm-model"], "");
  const llmBaseUrl = getArg(argv, ["--llm-base-url"], "");
  const openaiApiKeyEnv = getArg(argv, ["--openai-api-key-env"], "");
  const enableRetrieval = hasFlag(argv, ["--enable-retrieval", "--source-retrieval"]);
  const rb = getArg(argv, ["--retrieval-backend"], "memory").toLowerCase();
  const retrievalBackend: "memory" | "chroma" = rb === "chroma" ? "chroma" : "memory";
  const retrievalHybridRegex = getArg(argv, ["--retrieval-hybrid-regex"], "");
  const retrievalSymbolBoost = getArg(argv, ["--retrieval-symbol-boost"], "");
  const enableCodeWalk = hasFlag(argv, ["--enable-code-walk", "--source-code-walk"]);
  const enableCodeWalkAgent = hasFlag(argv, ["--enable-code-walk-agent"]);
  const enableCodeWalkSearchAgent = hasFlag(argv, ["--enable-code-walk-search-agent"]);
  const embeddingBackendFlag = getArg(argv, ["--embedding-backend"], "");
  const priorRunPath = getArg(argv, ["--prior-run"], "");
  const vectorCachePath = getArg(argv, ["--vector-cache-path"], "");
  const vectorCacheMode = getArg(argv, ["--vector-cache-mode"], "");
  const userQuery = getArg(argv, ["--user-query"], "");
  const followUp = getArg(argv, ["--follow-up"], "");
  const phaseParsed = parseHydratePhase(getArg(argv, ["--phase"], ""));
  if (!phaseParsed.ok) {
    return { ok: false, message: phaseParsed.message };
  }
  const forcePriorRun = hasFlag(argv, ["--force-prior"]);
  const spRaw = getArg(argv, ["--source-priority"], "").trim().toLowerCase();
  let sourcePriority: HydrateCliOptions["sourcePriority"] = "default";
  if (!spRaw || spRaw === "default") {
    sourcePriority = "default";
  } else if (spRaw === "ast-first") {
    sourcePriority = "ast-first";
  } else if (spRaw === "retrieval-first") {
    sourcePriority = "retrieval-first";
  } else {
    return {
      ok: false,
      message: `merge-tonic hydrate: unknown --source-priority "${spRaw}". Use default | ast-first | retrieval-first.`,
    };
  }

  const hydrateFlags = new Set([
    "--repo",
    "-R",
    "--out-dir",
    "--hydration-config",
    "--left-intent",
    "--right-intent",
    "--intent-pair",
    "--intent-profile",
    "--question-mode",
    "--strict-llm",
    "--llm-model",
    "--llm-base-url",
    "--openai-api-key-env",
    "--enable-retrieval",
    "--source-retrieval",
    "--enable-code-walk",
    "--source-code-walk",
    "--prior-run",
    "--user-query",
    "--follow-up",
    "--enable-code-walk-agent",
    "--enable-code-walk-search-agent",
    "--retrieval-backend",
    "--retrieval-hybrid-regex",
    "--retrieval-symbol-boost",
    "--embedding-backend",
    "--phase",
    "--force-prior",
    "--source-priority",
    "--vector-cache-path",
    "--vector-cache-mode",
  ]);

  const astArgv: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      astArgv.push(...argv.slice(i));
      break;
    }
    if (hydrateFlags.has(a)) {
      if (
        a !== "--strict-llm" &&
        a !== "--enable-retrieval" &&
        a !== "--source-retrieval" &&
        a !== "--enable-code-walk" &&
        a !== "--source-code-walk" &&
        a !== "--enable-code-walk-agent" &&
        a !== "--enable-code-walk-search-agent" &&
        a !== "--force-prior"
      ) {
        if (argv[i + 1] && !argv[i + 1]!.startsWith("-")) {
          i++;
        }
      }
      continue;
    }
    astArgv.push(a);
  }

  const env = { ...process.env };
  if (embeddingBackendFlag.trim()) {
    env.TONIC_EMBEDDING_BACKEND = embeddingBackendFlag.trim();
  }
  if (vectorCachePath.trim()) {
    env.TONIC_VECTOR_CACHE_PATH = vectorCachePath.trim();
  }
  if (vectorCacheMode.trim()) {
    env.TONIC_VECTOR_CACHE_MODE = vectorCacheMode.trim();
  }

  return {
    ok: true,
    opts: {
      repoRoot: repo,
      outDir,
      hydrationConfigPath,
      leftIntent,
      rightIntent,
      intentPair,
      intentProfile,
      questionModeCli,
      strictLlm,
      llmModel,
      llmBaseUrl,
      openaiApiKeyEnv,
      enableRetrieval,
      retrievalBackend,
      retrievalHybridRegex,
      retrievalSymbolBoost,
      enableCodeWalk,
      enableCodeWalkAgent,
      enableCodeWalkSearchAgent,
      userQuery,
      followUp,
      priorRunPath,
      hydratePhaseMax: phaseParsed.max,
      forcePriorRun,
      sourcePriority,
      vectorCachePath,
      vectorCacheMode,
      astArgv,
      env,
    },
  };
}

export async function runHydrationPipelineFromArgv(argv: string[]): Promise<number> {
  const parsed = parseHydrateArgv(argv);
  if (!parsed.ok) {
    console.error(parsed.message);
    return 11;
  }
  return runHydrationPipeline(parsed.opts);
}
