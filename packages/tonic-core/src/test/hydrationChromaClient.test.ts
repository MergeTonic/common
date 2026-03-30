import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMissingOptionalAiDependencySkipResult,
  parseHydrationChromaUrl,
  probeHydrationChromaHeartbeat,
  probeHydrationRuntimeReadiness,
  resolveHydrationRuntimeConfig,
  runtimeModeToBackend,
} from "../hydration";

test("resolveHydrationRuntimeConfig preserves requested Chroma modes", () => {
  const cfg = resolveHydrationRuntimeConfig("C:\\repo\\demo", {
    TONIC_CHROMA_MODE: "persistent",
  });
  assert.equal(cfg.mode, "persistent");
  assert.equal(runtimeModeToBackend(cfg.mode), "chroma-persistent");
});

test("parseHydrationChromaUrl returns normalized connection info", () => {
  const parsed = parseHydrationChromaUrl("https://localhost:8443/api");
  assert.equal(parsed.host, "localhost");
  assert.equal(parsed.port, 8443);
  assert.equal(parsed.ssl, true);
  assert.equal(parsed.origin, "https://localhost:8443");
});

test("probeHydrationChromaHeartbeat uses configured heartbeat path", async () => {
  const result = await probeHydrationChromaHeartbeat(
    {
      url: "http://127.0.0.1:8000",
      heartbeatPath: "/api/v2/heartbeat",
    },
    {
      fetchImpl: async (input) =>
        new Response("ok", {
          status: String(input).endsWith("/api/v2/heartbeat") ? 200 : 404,
        }),
    },
  );
  assert.equal(result.ok, true);
  assert.match(result.heartbeatUrl, /api\/v2\/heartbeat$/);
});

test("probeHydrationRuntimeReadiness skips non-http runtimes", async () => {
  const result = await probeHydrationRuntimeReadiness("C:\\repo\\demo", {
    TONIC_CHROMA_MODE: "memory",
  });
  assert.equal(result, null);
});

test("missing optional AI skip result reports default backend and package metadata", () => {
  const result = buildMissingOptionalAiDependencySkipResult("C:\\repo\\demo", "missing chroma");
  assert.equal(result.vector_backend, "chroma-http");
  assert.equal(result.metadata?.missing_package, "chromadb");
});
