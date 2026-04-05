import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { HYDRATE_PHASE_ALL } from "../hydration/hydrationPhase";
import { runHydrationPipeline } from "../hydration/pipeline";
import { EXIT_OK, EXIT_PARTIAL } from "../astGrep/types";

const fixDir = path.join(__dirname, "..", "..", "src", "test", "fixtures", "astGrep");

test("hydration pipeline writes intent bootstrap and run envelope", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-hyd-"));
  fs.writeFileSync(path.join(dir, "README.md"), "# x\n", "utf8");
  const outDir = path.join(dir, "out");
  const fake = path.resolve(fixDir, "fake-sg-success.js");
  const rc = await runHydrationPipeline({
    repoRoot: dir,
    outDir,
    hydrationConfigPath: "",
    leftIntent: "keep tests green",
    rightIntent: "ship features",
    intentPair: "",
    intentProfile: "",
    questionModeCli: "off",
    strictLlm: false,
    llmModel: "",
    llmBaseUrl: "",
    openaiApiKeyEnv: "",
    enableRetrieval: false,
    retrievalBackend: "memory",
    retrievalHybridRegex: "",
    retrievalSymbolBoost: "",
    enableCodeWalk: false,
    enableCodeWalkAgent: false,
    enableCodeWalkSearchAgent: false,
    userQuery: "explain @merge",
    followUp: "",
    priorRunPath: "",
    hydratePhaseMax: HYDRATE_PHASE_ALL,
    forcePriorRun: false,
    sourcePriority: "default",
    vectorCachePath: "",
    vectorCacheMode: "",
    astArgv: [`--ast-grep-bin`, fake],
    env: { ...process.env },
  });
  assert.equal(rc, EXIT_OK);
  const runPath = path.join(outDir, "hydration-run.json");
  const run = JSON.parse(fs.readFileSync(runPath, "utf8")) as {
    schema: string;
    pipeline?: { stages: { id: string }[] };
    intent_bootstrap_path?: string;
    inputs?: { user_query?: string | null };
  };
  assert.equal(run.schema, "tonic-hydration-run");
  assert.equal(run.inputs?.user_query, "explain @merge");
  const ids = run.pipeline?.stages.map((s) => s.id) ?? [];
  assert.ok(ids.includes("conflicts"));
  assert.ok(ids.indexOf("conflicts") < ids.indexOf("intent_bootstrap"));
  assert.ok(ids.includes("intent_bootstrap"));
  assert.ok(ids.includes("ast_grep"));
  assert.ok(ids.includes("intent_bundle"));
  const boot = JSON.parse(
    fs.readFileSync(path.join(outDir, "intent-bootstrap.json"), "utf8"),
  ) as { left_intent: string };
  assert.equal(boot.left_intent, "keep tests green");
});

test("hydration pipeline retrieval produces hits when ast matches indexable files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-hyd-ret-"));
  fs.writeFileSync(path.join(dir, "sample.ts"), "// indexed\n", "utf8");
  const outDir = path.join(dir, "out");
  const fake = path.resolve(fixDir, "fake-sg-success.js");
  const rc = await runHydrationPipeline({
    repoRoot: dir,
    outDir,
    hydrationConfigPath: "",
    leftIntent: "L",
    rightIntent: "R",
    intentPair: "",
    intentProfile: "",
    questionModeCli: "off",
    strictLlm: false,
    llmModel: "",
    llmBaseUrl: "",
    openaiApiKeyEnv: "",
    enableRetrieval: true,
    retrievalBackend: "memory",
    retrievalHybridRegex: "",
    retrievalSymbolBoost: "",
    enableCodeWalk: true,
    enableCodeWalkAgent: false,
    enableCodeWalkSearchAgent: false,
    userQuery: "",
    followUp: "",
    priorRunPath: "",
    hydratePhaseMax: HYDRATE_PHASE_ALL,
    forcePriorRun: false,
    sourcePriority: "default",
    vectorCachePath: "",
    vectorCacheMode: "",
    astArgv: [`--ast-grep-bin`, fake],
    env: { ...process.env },
  });
  assert.ok(rc === EXIT_OK || rc === 13);
  const ret = JSON.parse(fs.readFileSync(path.join(outDir, "retrieval-hydration.json"), "utf8")) as {
    hits: unknown[];
  };
  assert.ok(ret.hits.length > 0, "expected non-empty retrieval hits");
  const cw = JSON.parse(fs.readFileSync(path.join(outDir, "code-walk-trace.json"), "utf8")) as {
    schema: string;
    steps: unknown[];
  };
  assert.equal(cw.schema, "tonic-code-walk-trace");
  assert.ok(Array.isArray(cw.steps) && cw.steps.length > 0);
  const intent = JSON.parse(fs.readFileSync(path.join(outDir, "intent-hydration.json"), "utf8")) as {
    evidence_links: Array<{ type: string }>;
  };
  const types = new Set(intent.evidence_links.map((l) => l.type));
  assert.ok(types.has("retrieval_hit"));
  assert.ok(types.has("code_walk"));
});

test("hydration pipeline: TONIC_RETRIEVAL_BACKEND env overrides CLI retrieval backend", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-hyd-envrb-"));
  fs.writeFileSync(path.join(dir, "sample.ts"), "// x\n", "utf8");
  const outDir = path.join(dir, "out");
  const fake = path.resolve(fixDir, "fake-sg-success.js");
  const rc = await runHydrationPipeline({
    repoRoot: dir,
    outDir,
    hydrationConfigPath: "",
    leftIntent: "L",
    rightIntent: "R",
    intentPair: "",
    intentProfile: "",
    questionModeCli: "off",
    strictLlm: false,
    llmModel: "",
    llmBaseUrl: "",
    openaiApiKeyEnv: "",
    enableRetrieval: true,
    retrievalBackend: "chroma",
    retrievalHybridRegex: "",
    retrievalSymbolBoost: "",
    enableCodeWalk: false,
    enableCodeWalkAgent: false,
    enableCodeWalkSearchAgent: false,
    userQuery: "",
    followUp: "",
    priorRunPath: "",
    hydratePhaseMax: HYDRATE_PHASE_ALL,
    forcePriorRun: false,
    sourcePriority: "default",
    vectorCachePath: "",
    vectorCacheMode: "",
    astArgv: [`--ast-grep-bin`, fake],
    env: { ...process.env, TONIC_RETRIEVAL_BACKEND: "memory" },
  });
  assert.ok(rc === EXIT_OK || rc === 13);
  const run = JSON.parse(fs.readFileSync(path.join(outDir, "hydration-run.json"), "utf8")) as {
    pipeline?: { source_config?: { retrieval_backend?: string } };
    warnings?: Array<{ code: string }>;
  };
  assert.equal(run.pipeline?.source_config?.retrieval_backend, "memory");
  assert.ok(
    !(run.warnings ?? []).some((w) => w.code === "retrieval_chroma_misconfigured"),
    "memory backend should not emit chroma misconfiguration warning",
  );
});

test("hydration pipeline: chroma backend without TONIC_CHROMA_URL emits retrieval_chroma_misconfigured", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-hyd-chwarn-"));
  fs.writeFileSync(path.join(dir, "sample.ts"), "// x\n", "utf8");
  const outDir = path.join(dir, "out");
  const fake = path.resolve(fixDir, "fake-sg-success.js");
  const rc = await runHydrationPipeline({
    repoRoot: dir,
    outDir,
    hydrationConfigPath: "",
    leftIntent: "L",
    rightIntent: "R",
    intentPair: "",
    intentProfile: "",
    questionModeCli: "off",
    strictLlm: false,
    llmModel: "",
    llmBaseUrl: "",
    openaiApiKeyEnv: "",
    enableRetrieval: true,
    retrievalBackend: "memory",
    retrievalHybridRegex: "",
    retrievalSymbolBoost: "",
    enableCodeWalk: false,
    enableCodeWalkAgent: false,
    enableCodeWalkSearchAgent: false,
    userQuery: "",
    followUp: "",
    priorRunPath: "",
    hydratePhaseMax: HYDRATE_PHASE_ALL,
    forcePriorRun: false,
    sourcePriority: "default",
    vectorCachePath: "",
    vectorCacheMode: "",
    astArgv: [`--ast-grep-bin`, fake],
    env: { ...process.env, TONIC_RETRIEVAL_BACKEND: "chroma", TONIC_CHROMA_URL: "" },
  });
  assert.ok(rc === EXIT_OK || rc === 13);
  const run = JSON.parse(fs.readFileSync(path.join(outDir, "hydration-run.json"), "utf8")) as {
    warnings?: Array<{ code: string }>;
  };
  assert.ok((run.warnings ?? []).some((w) => w.code === "retrieval_chroma_misconfigured"));
});

test("hydration pipeline vector cache write then read yields same retrieval hits", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-hyd-vcache-"));
  fs.writeFileSync(path.join(dir, "sample.ts"), "// indexed\n", "utf8");
  const outDir = path.join(dir, "out");
  const cacheFile = path.join(dir, "vec.json");
  const fake = path.resolve(fixDir, "fake-sg-success.js");
  const base = {
    repoRoot: dir,
    outDir,
    hydrationConfigPath: "",
    leftIntent: "L",
    rightIntent: "R",
    intentPair: "",
    intentProfile: "",
    questionModeCli: "off" as const,
    strictLlm: false,
    llmModel: "",
    llmBaseUrl: "",
    openaiApiKeyEnv: "",
    enableRetrieval: true,
    retrievalBackend: "memory" as const,
    retrievalHybridRegex: "",
    retrievalSymbolBoost: "",
    enableCodeWalk: false,
    enableCodeWalkAgent: false,
    enableCodeWalkSearchAgent: false,
    userQuery: "",
    followUp: "",
    priorRunPath: "",
    hydratePhaseMax: HYDRATE_PHASE_ALL,
    forcePriorRun: false,
    sourcePriority: "default" as const,
    vectorCachePath: cacheFile,
    vectorCacheMode: "write" as const,
    astArgv: [`--ast-grep-bin`, fake],
    env: { ...process.env },
  };
  const rc1 = await runHydrationPipeline(base);
  assert.ok(rc1 === EXIT_OK || rc1 === 13);
  const ret1 = JSON.parse(fs.readFileSync(path.join(outDir, "retrieval-hydration.json"), "utf8")) as {
    hits: unknown[];
  };
  assert.ok(fs.existsSync(cacheFile));
  const rc2 = await runHydrationPipeline({ ...base, vectorCacheMode: "read" as const });
  assert.ok(rc2 === EXIT_OK || rc2 === 13);
  const ret2 = JSON.parse(fs.readFileSync(path.join(outDir, "retrieval-hydration.json"), "utf8")) as {
    hits: unknown[];
  };
  assert.deepEqual(ret2.hits, ret1.hits);
});

test("hydration pipeline conflict gate zero_stop exits partial with no markers", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-hyd-gate-"));
  fs.writeFileSync(path.join(dir, "README.md"), "# clean\n", "utf8");
  const outDir = path.join(dir, "out");
  const fake = path.resolve(fixDir, "fake-sg-success.js");
  const env = { ...process.env, TONIC_CONFLICT_GATE: "zero_stop" };
  const rc = await runHydrationPipeline({
    repoRoot: dir,
    outDir,
    hydrationConfigPath: "",
    leftIntent: "L",
    rightIntent: "R",
    intentPair: "",
    intentProfile: "",
    questionModeCli: "off",
    strictLlm: false,
    llmModel: "",
    llmBaseUrl: "",
    openaiApiKeyEnv: "",
    enableRetrieval: false,
    retrievalBackend: "memory",
    retrievalHybridRegex: "",
    retrievalSymbolBoost: "",
    enableCodeWalk: false,
    enableCodeWalkAgent: false,
    enableCodeWalkSearchAgent: false,
    userQuery: "",
    followUp: "",
    priorRunPath: "",
    hydratePhaseMax: HYDRATE_PHASE_ALL,
    forcePriorRun: false,
    sourcePriority: "default",
    vectorCachePath: "",
    vectorCacheMode: "",
    astArgv: [`--ast-grep-bin`, fake],
    env,
  });
  assert.equal(rc, EXIT_PARTIAL);
  const runPath = path.join(outDir, "hydration-run.json");
  const run = JSON.parse(fs.readFileSync(runPath, "utf8")) as {
    inputs?: { conflict_gate?: { policy?: string; action?: string } };
    pipeline?: { stages: Array<{ id: string; status?: string }> };
    warnings?: Array<{ code: string }>;
  };
  assert.equal(run.inputs?.conflict_gate?.policy, "zero_stop");
  assert.equal(run.inputs?.conflict_gate?.action, "stop");
  assert.ok((run.warnings ?? []).some((w) => w.code === "conflict_gate_stop"));
  const stages = run.pipeline?.stages ?? [];
  const ids = stages.map((s) => s.id);
  assert.ok(ids.includes("conflicts"));
  const boot = stages.find((s) => s.id === "intent_bootstrap");
  assert.ok(boot, "expected intent_bootstrap stage record after gate stop");
  assert.equal(boot?.status, "skipped");
});

test("hydration pipeline post-retrieval refinement rewrites pass2 to match canonical intents", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-hyd-pr-pass2-"));
  fs.writeFileSync(path.join(dir, "sample.ts"), "// indexed\n", "utf8");
  const outDir = path.join(dir, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const cfgPath = path.join(dir, "hydration-config.json");
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      question_mode: "improver",
      question_refinement_context: "progressive",
      llm_base_url: "http://127.0.0.1:9/v1",
      llm_model: "fake-model",
    }),
    "utf8",
  );
  const fake = path.resolve(fixDir, "fake-sg-success.js");
  const bodies = [
    JSON.stringify({
      refined_left_intent: "L1",
      refined_right_intent: "R1",
      merge_goals: [] as string[],
      assumptions: [] as string[],
    }),
    JSON.stringify({
      refined_left_intent: "L2",
      refined_right_intent: "R2",
      merge_goals: [],
      assumptions: [],
    }),
    JSON.stringify({
      refined_left_intent: "L3_post",
      refined_right_intent: "R3_post",
      merge_goals: [],
      assumptions: [],
    }),
  ];
  let call = 0;
  const mockFetch: typeof fetch = async () => {
    const content = bodies[Math.min(call, bodies.length - 1)]!;
    call += 1;
    const payload = JSON.stringify({
      choices: [{ message: { content } }],
    });
    return new Response(payload, { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const env = {
    ...process.env,
    OPENAI_API_KEY: "test-key",
    TONIC_POST_RETRIEVAL_REFINEMENT: "1",
    TONIC_SKIP_R2_RETRIEVAL: "1",
  };
  const rc = await runHydrationPipeline({
    repoRoot: dir,
    outDir,
    hydrationConfigPath: cfgPath,
    leftIntent: "L0",
    rightIntent: "R0",
    intentPair: "",
    intentProfile: "",
    questionModeCli: undefined,
    strictLlm: false,
    llmModel: "",
    llmBaseUrl: "",
    openaiApiKeyEnv: "",
    enableRetrieval: true,
    retrievalBackend: "memory",
    retrievalHybridRegex: "",
    retrievalSymbolBoost: "",
    enableCodeWalk: false,
    enableCodeWalkAgent: false,
    enableCodeWalkSearchAgent: false,
    userQuery: "",
    followUp: "",
    priorRunPath: "",
    hydratePhaseMax: HYDRATE_PHASE_ALL,
    forcePriorRun: false,
    sourcePriority: "default",
    vectorCachePath: "",
    vectorCacheMode: "",
    astArgv: [`--ast-grep-bin`, fake],
    env,
    fetchImpl: mockFetch,
  });
  assert.ok(rc === EXIT_OK || rc === 13, `expected ok or partial, got ${rc}`);
  const canon = JSON.parse(fs.readFileSync(path.join(outDir, "question-refinement.json"), "utf8")) as {
    refined_left_intent?: string;
    refined_right_intent?: string;
  };
  const pass2 = JSON.parse(
    fs.readFileSync(path.join(outDir, "question-refinement.pass2.v1.json"), "utf8"),
  ) as {
    refined_left_intent?: string;
    refined_right_intent?: string;
  };
  assert.equal(canon.refined_left_intent, "L3_post");
  assert.equal(canon.refined_right_intent, "R3_post");
  assert.equal(pass2.refined_left_intent, canon.refined_left_intent);
  assert.equal(pass2.refined_right_intent, canon.refined_right_intent);
  assert.equal(call, 3, "expected three LLM calls: pass1, pass2, post-retrieval");
});
