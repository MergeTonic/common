import type { RetrievalHit } from "../../hydrationTypes";
import type { CodeSearchSession } from "./types";
import { materializeHitPool, toolRegexHits, toolSemanticQuery, toolSymbolHits } from "./tools";

export type CodeSearchAgentParams = {
  session: CodeSearchSession;
  maxTurns: number;
  model: string;
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Optional seed query when the model returns `done` on turn 0. */
  seedQuery?: string;
};

type ToolPlan = {
  tool?: string;
  query?: string;
  pattern?: string;
  symbol?: string;
};

function stripFence(s: string): string {
  const t = s.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  return m ? m[1]!.trim() : t;
}

/**
 * Multi-turn OpenAI-compatible chat loop producing code-walk trace steps
 * (`semantic_query`, `regex_search`, `symbol_search`, or `done`).
 */
export async function runCodeSearchAgentTurns(
  params: CodeSearchAgentParams,
): Promise<{ steps: Array<Record<string, unknown>> }> {
  const steps: Array<Record<string, unknown>> = [];
  const fetchFn = params.fetchImpl ?? globalThis.fetch;
  const url = `${params.baseUrl.replace(/\/$/, "")}/chat/completions`;
  let pool: RetrievalHit[] | null = null;

  for (let turn = 0; turn < params.maxTurns; turn++) {
    const system =
      'You choose search tools for merge hydration. Reply JSON only: {"tool":"semantic_query"|"regex_search"|"symbol_search"|"done","query"?:string,"pattern"?:string,"symbol"?:string}. ' +
      "semantic_query uses vector search; regex_search and symbol_search filter a materialized chunk pool.";
    const prior = steps.length
      ? JSON.stringify(steps.map((s) => ({ tool: s.tool, summary: (s.outcome as { summary?: string })?.summary })))
      : "[]";
    const user = `Turn ${turn + 1}/${params.maxTurns}. Prior steps: ${prior}\nPick the next tool or done.`;
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0.1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      steps.push({
        tool: "llm_error",
        outcome: { message: `HTTP ${res.status}: ${t.slice(0, 400)}` },
      });
      break;
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    let plan: ToolPlan = {};
    try {
      plan = JSON.parse(stripFence(raw)) as ToolPlan;
    } catch {
      steps.push({
        tool: "llm_parse_error",
        outcome: { raw: raw.slice(0, 800) },
      });
      break;
    }
    const tool = (plan.tool ?? "").toLowerCase();
    if (tool === "done") {
      if (turn === 0 && params.seedQuery?.trim()) {
        const hits = await toolSemanticQuery(params.session, params.seedQuery.trim(), 12);
        steps.push({
          tool: "semantic_query",
          outcome: { chunks: hits.slice(0, 8), summary: "seed query (model returned done)" },
        });
      }
      steps.push({ tool: "done", outcome: { reason: "model_done" } });
      break;
    }
    if (tool === "semantic_query" && plan.query?.trim()) {
      const hits = await toolSemanticQuery(params.session, plan.query.trim(), 12);
      steps.push({
        tool: "semantic_query",
        outcome: { chunks: hits.slice(0, 8), query: plan.query.trim() },
      });
      continue;
    }
    if (!pool) {
      pool = await materializeHitPool(params.session, 128);
    }
    if (tool === "regex_search" && plan.pattern) {
      const hits = toolRegexHits(pool, plan.pattern);
      steps.push({
        tool: "regex_search",
        outcome: { chunks: hits.slice(0, 12), pattern: plan.pattern },
      });
      continue;
    }
    if (tool === "symbol_search" && plan.symbol) {
      const hits = toolSymbolHits(pool, plan.symbol);
      steps.push({
        tool: "symbol_search",
        outcome: { chunks: hits.slice(0, 12), symbol: plan.symbol },
      });
      continue;
    }
    steps.push({
      tool: "llm_invalid_tool",
      outcome: { plan },
    });
    break;
  }
  return { steps };
}