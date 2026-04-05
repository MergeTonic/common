export type LlmChatParams = {
  baseUrl: string;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  timeoutMs: number;
  /** When false, omit OpenAI `response_format` (some OpenAI-compatible servers reject json_object). */
  jsonObject?: boolean;
};

function stripJsonFence(s: string): string {
  const t = s.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  if (fence) {
    return fence[1]!.trim();
  }
  return t;
}

export async function callOpenAiCompatibleJson(
  params: LlmChatParams,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const url = `${params.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), Math.max(1000, params.timeoutMs));
  const useJsonObject = params.jsonObject !== false;
  try {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      temperature: 0.2,
    };
    if (useJsonObject) {
      body.response_format = { type: "json_object" };
    }
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, message: `HTTP ${res.status}: ${errText.slice(0, 500)}` };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) {
      return { ok: false, message: "empty completion" };
    }
    return { ok: true, text: stripJsonFence(text) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  } finally {
    clearTimeout(tid);
  }
}

export type QuestionRefinementPartial = {
  refined_left_intent?: string;
  refined_right_intent?: string;
  merge_goals?: string[];
  assumptions?: string[];
  subquestions?: Array<{ id: string; text: string; priority?: number }>;
};

export function parseQuestionRefinementJson(
  raw: string,
  mode: "improver" | "subquestions",
): { ok: true; value: QuestionRefinementPartial } | { ok: false; message: string } {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return { ok: false, message: "invalid JSON from model" };
  }
  if (!j || typeof j !== "object") {
    return { ok: false, message: "model JSON must be object" };
  }
  const o = j as Record<string, unknown>;
  if (mode === "improver") {
    const left = typeof o.refined_left_intent === "string" ? o.refined_left_intent : "";
    const right = typeof o.refined_right_intent === "string" ? o.refined_right_intent : "";
    const mergeGoals = Array.isArray(o.merge_goals)
      ? o.merge_goals.filter((x): x is string => typeof x === "string")
      : [];
    const assumptions = Array.isArray(o.assumptions)
      ? o.assumptions.filter((x): x is string => typeof x === "string")
      : [];
    if (!left || !right) {
      return { ok: false, message: "improver JSON missing refined_left_intent/refined_right_intent" };
    }
    return {
      ok: true,
      value: {
        refined_left_intent: left,
        refined_right_intent: right,
        merge_goals: mergeGoals,
        assumptions,
      },
    };
  }
  const sq = o.subquestions;
  if (!Array.isArray(sq)) {
    return { ok: false, message: "subquestions array required" };
  }
  const subquestions = sq
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }
      const r = row as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : "";
      const text = typeof r.text === "string" ? r.text : "";
      const priority = typeof r.priority === "number" ? r.priority : 0;
      if (!id || !text) {
        return null;
      }
      return { id, text, priority };
    })
    .filter((x): x is { id: string; text: string; priority: number } => x !== null)
    .sort((a, b) => (a.priority !== b.priority ? b.priority - a.priority : a.id.localeCompare(b.id)));
  return { ok: true, value: { subquestions } };
}
