import test from "node:test";
import assert from "node:assert/strict";

import { HistogramEmbeddingProvider, OpenAiCompatibleEmbeddingProvider } from "../retrieval/embeddingProvider";
import { resolveEmbeddingProvider } from "../retrieval/resolveEmbeddingProvider";

test("HistogramEmbeddingProvider maps text to 48-dim vectors", async () => {
  const p = new HistogramEmbeddingProvider();
  const v = await p.embedBatch(["a", "bb"]);
  assert.equal(v.length, 2);
  assert.equal(v[0]!.length, 48);
});

test("OpenAiCompatibleEmbeddingProvider POSTs /embeddings and parses vectors", async () => {
  let called = "";
  const fetchImpl = async (url: string | URL, init?: RequestInit) => {
    called = String(url);
    const body = JSON.parse(String(init?.body)) as { input: string[] };
    assert.ok(Array.isArray(body.input));
    return new Response(
      JSON.stringify({
        data: body.input.map((_, i) => ({
          embedding: [0.1 * (i + 1), 0.2 * (i + 1), 0.3 * (i + 1), 0.4 * (i + 1)],
        })),
      }),
      { status: 200 },
    );
  };
  const p = new OpenAiCompatibleEmbeddingProvider({
    baseUrl: "http://127.0.0.1:9/v1",
    model: "embed-model",
    fetchImpl: fetchImpl as typeof fetch,
  });
  const out = await p.embedBatch(["hello", "world"]);
  assert.match(called, /\/embeddings$/);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.length, 4);
});

test("resolveEmbeddingProvider hf_inference uses mock fetch", async () => {
  const prev = globalThis.fetch;
  try {
    globalThis.fetch = (async (url, init) => {
      assert.match(String(url), /api-inference\.huggingface\.co\/models\//);
      const h = init?.headers;
      const auth =
        h && typeof (h as Headers).get === "function"
          ? (h as Headers).get("Authorization")
          : (h as Record<string, string> | undefined)?.Authorization;
      assert.equal(auth, "Bearer tok");
      const body = JSON.parse(String(init?.body)) as { inputs: string };
      assert.equal(body.inputs, "hi");
      return new Response(JSON.stringify([0.25, 0.75]), { status: 200 });
    }) as typeof fetch;
    const env = {
      TONIC_EMBEDDING_BACKEND: "hf_inference",
      HF_TOKEN: "tok",
      TONIC_HF_EMBED_MODEL: "sentence-transformers/all-MiniLM-L6-v2",
    } as NodeJS.ProcessEnv;
    const p = resolveEmbeddingProvider(env);
    const out = await p.embedBatch(["hi"]);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.length, 2);
  } finally {
    globalThis.fetch = prev;
  }
});
