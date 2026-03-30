import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  DeterministicFakeEmbedder,
  type HydrationLlmService,
  HydrationIndexer,
  HydrationRepository,
  MemoryVectorIndex,
  runAgenticCodeSearchSession,
} from "../hydration";

function makeWorkspace(name: string): string {
  const root = path.join(os.tmpdir(), "tonic-hydration-agentic");
  fs.mkdirSync(root, { recursive: true });
  const repoRoot = path.join(root, name);
  fs.rmSync(repoRoot, { recursive: true, force: true });
  fs.mkdirSync(repoRoot, { recursive: true });
  return repoRoot;
}

test("runAgenticCodeSearchSession executes multi-step retrieval and returns evidence", async () => {
  const repoRoot = makeWorkspace("agentic-session");
  fs.mkdirSync(path.join(repoRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, "src", "auth.ts"),
    "export function resolveAuth(user: string): string {\n  return user;\n}\n",
    "utf8",
  );
  fs.writeFileSync(path.join(repoRoot, "src", "index.ts"), "export * from './auth';\n", "utf8");

  const index = new MemoryVectorIndex("agentic-session");
  const embedder = new DeterministicFakeEmbedder({ dimensions: 8 });
  const indexer = new HydrationIndexer(repoRoot, index, embedder);
  await indexer.sync({ vectorBackend: "memory", normativeCommit: "local" });

  const repository = new HydrationRepository(repoRoot);
  const session = await runAgenticCodeSearchSession({
    query: "How does resolveAuth work?",
    repository,
    index,
    embedder,
    topK: 3,
    maxPlanSize: 5,
    maxStepIterations: 6,
  });

  assert.ok(session.plan.length >= 2);
  assert.ok(session.outcomes.length >= 2);
  assert.ok(session.records.length >= 1);
  assert.ok(session.records.some((record) => record.filePath === "src/auth.ts"));
  assert.match(session.answer, /Evidence points to|No relevant code evidence/);
});

test("runAgenticCodeSearchSession can use LLM planning, override, and synthesis hooks", async () => {
  const repoRoot = makeWorkspace("agentic-session-llm");
  fs.mkdirSync(path.join(repoRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, "src", "auth.ts"),
    "export function resolveAuth(user: string): string {\n  return user;\n}\n",
    "utf8",
  );
  fs.writeFileSync(path.join(repoRoot, "src", "index.ts"), "export * from './auth';\n", "utf8");

  const index = new MemoryVectorIndex("agentic-session-llm");
  const embedder = new DeterministicFakeEmbedder({ dimensions: 8 });
  const indexer = new HydrationIndexer(repoRoot, index, embedder);
  await indexer.sync({ vectorBackend: "memory", normativeCommit: "local" });

  const evaluationCalls: Array<unknown> = [];
  const llmEvents: Array<string> = [];
  const llmService: HydrationLlmService = {
    providerId: "stub",
    model: "stub-model",
    async generateJson<T>(args: {
      schemaName: string;
      schemaDescription: string;
      messages: Array<{ role: "system" | "user"; content: string }>;
    }): Promise<T> {
      if (args.schemaName === "hydration_code_search_plan") {
        return {
          steps: [
            {
              id: "llm-hybrid",
              title: "Map likely entrypoints",
              description: "Run hybrid retrieval first.",
              kind: "hybrid",
            },
            {
              id: "llm-finalize",
              title: "Summarize",
              description: "Summarize current evidence.",
              kind: "finalize",
              parents: ["llm-hybrid"],
            },
          ],
        } as T;
      }
      if (args.schemaName === "hydration_code_search_evaluation") {
        evaluationCalls.push(args);
        if (evaluationCalls.length === 1) {
          return {
            decision: "override",
            steps: [
              {
                id: "llm-symbol",
                title: "Resolve declaration",
                description: "Find the resolveAuth declaration.",
                kind: "symbol",
                parents: ["llm-hybrid"],
                symbolCandidates: ["resolveAuth"],
              },
              {
                id: "llm-finalize",
                title: "Finalize",
                description: "Finalize from symbol evidence.",
                kind: "finalize",
                parents: ["llm-symbol"],
              },
            ],
          } as T;
        }
        return { decision: "break", steps: [] } as T;
      }
      if (args.schemaName === "hydration_code_search_final_answer") {
        return {
          answer: "resolveAuth is implemented in src/auth.ts.",
          reason: "Symbol search found the exported declaration in src/auth.ts.",
        } as T;
      }
      throw new Error(`Unexpected schema: ${args.schemaName}`);
    },
  };

  const repository = new HydrationRepository(repoRoot);
  const session = await runAgenticCodeSearchSession({
    query: "How does resolveAuth work?",
    repository,
    index,
    embedder,
    llmService,
    onLlmEvent(event): void {
      llmEvents.push(`${event.event}:${event.schemaName}`);
    },
    topK: 3,
    maxPlanSize: 5,
    maxStepIterations: 6,
  });

  assert.equal(session.answer, "resolveAuth is implemented in src/auth.ts.");
  assert.equal(session.answerReason, "Symbol search found the exported declaration in src/auth.ts.");
  assert.ok(session.plan.some((step) => step.id === "llm-finalize" && step.status === "cancelled"));
  assert.ok(session.plan.some((step) => step.id === "llm-symbol" && step.status === "success"));
  assert.ok(session.records.some((record) => record.filePath === "src/auth.ts"));
  assert.deepEqual(llmEvents, [
    "llm_request:hydration_code_search_plan",
    "llm_response:hydration_code_search_plan",
    "llm_request:hydration_code_search_evaluation",
    "llm_response:hydration_code_search_evaluation",
    "llm_request:hydration_code_search_evaluation",
    "llm_response:hydration_code_search_evaluation",
    "llm_request:hydration_code_search_final_answer",
    "llm_response:hydration_code_search_final_answer",
  ]);
});
