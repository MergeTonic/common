import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodeSearchExecuteStepUserPrompt,
  formatAgenticPromptTemplate,
  loadAgenticPrompts,
  loadConflictPrompts,
  loadHydrationPrompts,
} from "../hydration";

test("loadHydrationPrompts returns expected sections", () => {
  const bundle = loadHydrationPrompts();
  assert.equal(bundle.schema_version, 1);
  assert.ok(bundle.question_generation.system.length > 0);
  assert.ok(bundle.synthesis.user.length > 0);
});

test("loadHydrationPrompts supports explicit prompt profiles", () => {
  const bundle = loadHydrationPrompts("compact");
  assert.equal(bundle.schema_version, 1);
  assert.match(bundle.question_generation.system, /concise retrieval questions|Plan concise retrieval questions/);
});

test("loadConflictPrompts returns JSON-response contract suffix", () => {
  const bundle = loadConflictPrompts();
  assert.equal(bundle.schema_version, 1);
  assert.match(bundle.github_json_response_suffix, /resolved_lines/);
  assert.ok(bundle.conflict_user.enhanced.length > 0);
});

test("loadAgenticPrompts exposes vendored base and code-search prompt sections", () => {
  const bundle = loadAgenticPrompts();
  assert.equal(bundle.schema_version, 1);
  assert.match(bundle.base.generate_plan, /maximum \{max_size\} steps/);
  assert.match(bundle.code_search.execute_step_system, /expert code search agent/);
  assert.match(bundle.bcp_search.evaluate_plan_system, /overridePlan/);
});

test("formatAgenticPromptTemplate preserves unknown placeholders", () => {
  const rendered = formatAgenticPromptTemplate(
    "Plan {count} steps for {scope} and keep {unknown} unchanged",
    { count: "3", scope: "src/**" },
  );
  assert.equal(rendered, "Plan 3 steps for src/** and keep {unknown} unchanged");
});

test("buildCodeSearchExecuteStepUserPrompt renders history with chunks and insights", () => {
  const rendered = buildCodeSearchExecuteStepUserPrompt({
    context: {
      query: "How does auth work?",
      plan: [{ id: "1", title: "Find auth entrypoints" }],
      history: [
        {
          stepId: "1",
          summary: "Located auth entrypoint",
          chunks: [{ filePath: "src/auth.ts", symbol: "resolveAuth", snippet: "export function resolveAuth..." }],
          insights: ["resolveAuth delegates to policy engine"],
        },
      ],
    },
    step: { id: "2", title: "Trace call graph", description: "Follow resolveAuth callers" },
  });
  assert.match(rendered, /The original user query: How does auth work\?/);
  assert.match(rendered, /Relevant code:\n  - src\/auth\.ts \(resolveAuth\)/);
  assert.match(rendered, /Insights: resolveAuth delegates to policy engine/);
});
