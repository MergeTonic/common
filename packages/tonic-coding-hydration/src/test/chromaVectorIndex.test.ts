import test from "node:test";
import assert from "node:assert/strict";

import { ChromaVectorIndex } from "../vector/chromaVectorIndex";

test("ChromaVectorIndex upsert and query with mocked REST", async () => {
  const calls: string[] = [];
  const emb = [1, 0, 0, 0];
  const fetchImpl = async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method ?? "GET"} ${u}`);
    if (u.endsWith("/api/v1/collections") && init?.method === "GET") {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (u.endsWith("/api/v1/collections") && init?.method === "POST") {
      return new Response(JSON.stringify({ id: "col-1" }), { status: 200 });
    }
    if (u.includes("/collections/col-1/add")) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (u.includes("/collections/col-1/query")) {
      return new Response(
        JSON.stringify({
          ids: [["a"]],
          documents: [["doc-a"]],
          metadatas: [[{ path: "p.ts", source: "chroma" }]],
          distances: [[0.1]],
        }),
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  };
  const idx = new ChromaVectorIndex({ baseUrl: "http://c:8000", collection: "t" }, fetchImpl as typeof fetch);
  await idx.upsert([
    {
      id: "a",
      document: "doc-a",
      embedding: emb,
      metadata: { path: "p.ts" },
    },
  ]);
  const res = await idx.query(emb, 3);
  assert.equal(res.ids[0], "a");
  assert.ok(calls.some((c) => c.includes("/add")));
  assert.ok(calls.some((c) => c.includes("/query")));
});

test("ChromaVectorIndex create stores tonic:embedding_dim when configured", async () => {
  let createBody: string | undefined;
  const fetchImpl = async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/api/v1/collections") && init?.method === "GET") {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (u.endsWith("/api/v1/collections") && init?.method === "POST") {
      createBody = init?.body as string;
      return new Response(JSON.stringify({ id: "col-dim" }), { status: 200 });
    }
    if (u.includes("/collections/col-dim/add")) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
  const idx = new ChromaVectorIndex(
    { baseUrl: "http://c:8000", collection: "t", embeddingDim: 48 },
    fetchImpl as typeof fetch,
  );
  await idx.upsert([{ id: "a", document: "x", embedding: new Array(48).fill(0.1), metadata: {} }]);
  assert.ok(createBody);
  const parsed = JSON.parse(createBody!) as { metadata?: Record<string, unknown> };
  assert.equal(parsed.metadata?.["tonic:embedding_dim"], 48);
});

test("ChromaVectorIndex reuse throws on embedding_dim mismatch", async () => {
  const fetchImpl = async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/api/v1/collections") && init?.method === "GET" && !u.includes("/collections/")) {
      return new Response(JSON.stringify({ data: [{ id: "c1", name: "t" }] }), { status: 200 });
    }
    if (u.includes("/api/v1/collections/c1") && init?.method === "GET") {
      return new Response(
        JSON.stringify({ id: "c1", metadata: { "tonic:embedding_dim": 384 } }),
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  };
  const idx = new ChromaVectorIndex(
    { baseUrl: "http://c:8000", collection: "t", embeddingDim: 48 },
    fetchImpl as typeof fetch,
  );
  await assert.rejects(
    () => idx.upsert([{ id: "a", document: "x", embedding: new Array(48).fill(0), metadata: {} }]),
    /embedding dimension mismatch/,
  );
});
