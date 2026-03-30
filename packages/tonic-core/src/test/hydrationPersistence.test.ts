import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  acquireHydrationPersistLock,
  buildHydrationCacheKey,
  checkHydrationPersistHealth,
  writeHydrationPersistManifest,
} from "../hydration";

test("buildHydrationCacheKey hashes canonical cache ingredients", () => {
  const first = buildHydrationCacheKey({
    strategyId: "incremental-content-hash",
    prIdentifiers: ["42", "17"],
    embedderModel: "fake-v1",
    chunkerVersion: "line-estimate-v1",
  });
  const second = buildHydrationCacheKey({
    strategyId: "incremental-content-hash",
    prIdentifiers: ["17", "42"],
    embedderModel: "fake-v1",
    chunkerVersion: "line-estimate-v1",
  });
  assert.equal(first.cacheKey, second.cacheKey);
  assert.equal(first.prListHash, second.prListHash);
});

test("persist health rejects partial restores without a manifest", () => {
  const persistRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-persist-health-"));
  try {
    fs.writeFileSync(path.join(persistRoot, "chroma.sqlite3"), "", "utf8");
    const health = checkHydrationPersistHealth(persistRoot);
    assert.equal(health.ok, false);
    assert.match(health.reason ?? "", /index-state\.json/i);
  } finally {
    fs.rmSync(persistRoot, { recursive: true, force: true });
  }
});

test("persist manifest and writer lock protect the persisted tree", () => {
  const persistRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-persist-lock-"));
  try {
    fs.writeFileSync(path.join(persistRoot, "index-state.json"), "{}", "utf8");
    fs.writeFileSync(path.join(persistRoot, "chroma.sqlite3"), "", "utf8");
    writeHydrationPersistManifest({
      persistRoot,
      writerKind: "chroma-http",
      cacheKey: "demo",
    });
    const health = checkHydrationPersistHealth(persistRoot);
    assert.equal(health.ok, true);
    const lock = acquireHydrationPersistLock(persistRoot, "test-owner");
    assert.throws(() => acquireHydrationPersistLock(persistRoot, "other-owner"));
    lock.release();
  } finally {
    fs.rmSync(persistRoot, { recursive: true, force: true });
  }
});
