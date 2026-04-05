import test from "node:test";
import assert from "node:assert/strict";

import {
  HfInferenceEmbeddingProvider,
  hfEmbedInferenceRequestUrl,
} from "../retrieval/hfInferenceEmbeddingProvider";

test("hfEmbedInferenceRequestUrl default encodes model", () => {
  const u = hfEmbedInferenceRequestUrl("org/model", {});
  assert.match(u, /api-inference\.huggingface\.co/);
  assert.ok(u.includes(encodeURIComponent("org/model")));
});

test("hfEmbedInferenceRequestUrl replaces {model}", () => {
  const u = hfEmbedInferenceRequestUrl("m", {
    TONIC_HF_EMBED_INFERENCE_URL: "https://x/y/{model}/z",
  } as NodeJS.ProcessEnv);
  assert.equal(u, `https://x/y/${encodeURIComponent("m")}/z`);
});

test("HfInferenceEmbeddingProvider requires HF_TOKEN", async () => {
  const p = new HfInferenceEmbeddingProvider({
    model: "m",
    resolveToken: () => "",
    inferenceUrlTemplate: "http://local/embed",
  });
  await assert.rejects(() => p.embedBatch(["a"]), /HF_TOKEN is required/);
});

test("HfInferenceEmbeddingProvider parses flat and nested vectors", async () => {
  let lastUrl = "";
  let lastInit: RequestInit | undefined;
  const fetchImpl = async (url: string | URL, init?: RequestInit) => {
    lastUrl = String(url);
    lastInit = init;
    const body = JSON.parse(String(init?.body)) as { inputs: string };
    if (body.inputs === "flat") {
      return new Response(JSON.stringify([0.1, 0.2, 0.3]), { status: 200 });
    }
    return new Response(JSON.stringify([[0.5, 0.6]]), { status: 200 });
  };
  const p = new HfInferenceEmbeddingProvider({
    model: "m",
    resolveToken: () => "tok",
    inferenceUrlTemplate: "http://127.0.0.1/models/m",
    inferenceProvider: "cpu",
    fetchImpl: fetchImpl as typeof fetch,
    timeoutMs: 5000,
  });
  const a = await p.embedBatch(["flat"]);
  assert.equal(a[0]!.length, 3);
  const h = lastInit?.headers;
  const auth =
    h && typeof (h as Headers).get === "function"
      ? (h as Headers).get("Authorization")
      : (h as Record<string, string> | undefined)?.Authorization;
  assert.equal(auth, "Bearer tok");
  assert.match(lastUrl, /provider=cpu/);

  const b = await p.embedBatch(["nested"]);
  assert.equal(b[0]!.length, 2);
});

test("HfInferenceEmbeddingProvider rejects bad shape", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({}), { status: 200 });
  const p = new HfInferenceEmbeddingProvider({
    model: "m",
    resolveToken: () => "t",
    inferenceUrlTemplate: "http://x",
    fetchImpl: fetchImpl as typeof fetch,
    timeoutMs: 5000,
  });
  await assert.rejects(() => p.embedBatch(["x"]), /unexpected feature_extraction shape/);
});
