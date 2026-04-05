import type { RetrievalHit } from "../hydrationTypes";

export type CodeWalkTraceV1 = {
  schema: "tonic-code-walk-trace";
  version: "1";
  plan: Array<Record<string, unknown>>;
  steps: Array<Record<string, unknown>>;
};

/**
 * Optional single-turn LLM reflection over retrieval context (minimal "interactive" code-walk).
 * When `OPENAI_API_KEY` is missing, appends a skipped step with explanation.
 */
export async function enrichCodeWalkTraceWithLlmReflection(
  trace: CodeWalkTraceV1,
  params: {
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    leftIntent: string;
    rightIntent: string;
    retrievalHits: RetrievalHit[];
  },
): Promise<CodeWalkTraceV1> {
  const apiKey = (params.env.OPENAI_API_KEY ?? params.env.TONIC_OPENAI_API_KEY ?? "").trim();
  const baseUrl = (params.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = (params.env.TONIC_CODE_WALK_MODEL ?? params.env.TONIC_LLM_MODEL ?? "gpt-4o-mini").trim();

  const topChunks = params.retrievalHits.slice(0, 10).map((h) => ({
    path: h.metadata?.path,
    lines: `${h.metadata?.start_line ?? ""}-${h.metadata?.end_line ?? ""}`,
    text: h.text.slice(0, 400),
  }));

  if (!apiKey) {
    return {
      ...trace,
      steps: [
        ...trace.steps,
        {
          tool: "llm_reflection",
          outcome: {
            insights: [
              "Interactive code-walk reflection skipped: set OPENAI_API_KEY (or TONIC_OPENAI_API_KEY) to enable --enable-code-walk-agent.",
            ],
            mode: "skipped_no_credentials",
          },
        },
      ],
    };
  }

  const user = [
    "Merge intents:",
    `LEFT: ${params.leftIntent}`,
    `RIGHT: ${params.rightIntent}`,
    "",
    "Top retrieval chunks (JSON):",
    JSON.stringify(topChunks, null, 2),
    "",
    'Reply with compact JSON only: {"insights": string[], "plan_note": string} summarizing what to inspect next for resolving the merge. Max 5 insights.',
  ].join("\n");

  const fetchFn = params.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    return {
      ...trace,
      steps: [
        ...trace.steps,
        {
          tool: "llm_reflection",
          outcome: {
            insights: ["Interactive reflection skipped: no fetch implementation in this runtime."],
            mode: "skipped_no_fetch",
          },
        },
      ],
    };
  }

  try {
    const res = await fetchFn(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You help engineers navigate code during merge hydration. Output only valid JSON with keys insights (array of short strings) and plan_note (string).",
          },
          { role: "user", content: user },
        ],
      }),
    });
    const raw = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = raw.choices?.[0]?.message?.content?.trim() ?? "";
    let insights: string[] = [text.slice(0, 2000)];
    let planNote = "";
    try {
      const parsed = JSON.parse(text) as { insights?: unknown; plan_note?: string };
      if (Array.isArray(parsed.insights)) {
        insights = parsed.insights.map((x) => String(x)).filter(Boolean);
      }
      if (typeof parsed.plan_note === "string") {
        planNote = parsed.plan_note;
      }
    } catch {
      /* use raw text as single insight */
    }
    return {
      ...trace,
      plan: [
        ...trace.plan,
        {
          id: "llm-reflection",
          goal: "One-shot reflection over retrieval context",
          mode: "llm",
        },
      ],
      steps: [
        ...trace.steps,
        {
          tool: "llm_reflection",
          outcome: {
            insights,
            plan_note: planNote,
            model,
            mode: "interactive_llm",
          },
        },
      ],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ...trace,
      steps: [
        ...trace.steps,
        {
          tool: "llm_reflection",
          outcome: {
            insights: [`LLM reflection failed: ${msg}`],
            mode: "error",
          },
        },
      ],
    };
  }
}
