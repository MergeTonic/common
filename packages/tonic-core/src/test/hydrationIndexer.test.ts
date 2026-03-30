import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  DeterministicFakeEmbedder,
  HydrationIndexer,
  HydrationRepository,
  LineTokenEstimateChunker,
  MemoryVectorIndex,
  loadHydrationIndexState,
  resolveHydrationArtifactPaths,
} from "../hydration";

const HAS_GIT = spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0;

function makeRepo(name: string): string {
  const tempRoot = path.join(os.tmpdir(), "tonic-hydration-indexer");
  fs.mkdirSync(tempRoot, { recursive: true });
  const repoRoot = path.join(tempRoot, name);
  fs.rmSync(repoRoot, { recursive: true, force: true });
  fs.mkdirSync(repoRoot, { recursive: true });
  execFileSync("git", ["init"], { cwd: repoRoot, stdio: "ignore" });
  fs.writeFileSync(path.join(repoRoot, ".gitignore"), "ignored.txt\n*.pem\n", "utf8");
  return repoRoot;
}

test(
  "HydrationRepository respects gitignore and skips obvious secret files",
  { skip: !HAS_GIT },
  () => {
    const repoRoot = makeRepo("hydration-repo");
    fs.mkdirSync(path.join(repoRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "src", "app.ts"), "export const ok = true;\n", "utf8");
    fs.writeFileSync(path.join(repoRoot, "ignored.txt"), "ignore me\n", "utf8");
    fs.writeFileSync(path.join(repoRoot, ".env"), "TOKEN=secret\n", "utf8");
    fs.writeFileSync(path.join(repoRoot, "cert.pem"), "pem\n", "utf8");

    const repository = new HydrationRepository(repoRoot);
    const files = repository.readIndexableFiles().map((entry) => entry.relativePath);

    assert.deepEqual(files, ["src/app.ts"]);
  },
);

test(
  "HydrationIndexer performs incremental delete and upsert with index-state persistence",
  { skip: !HAS_GIT },
  async () => {
    const repoRoot = makeRepo("hydration-indexer");
    fs.mkdirSync(path.join(repoRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "src", "app.ts"), "one\ntwo\nthree\n", "utf8");
    fs.writeFileSync(path.join(repoRoot, "src", "util.ts"), "helper\n", "utf8");
    fs.writeFileSync(path.join(repoRoot, "src", "symbol.ts"), "export function resolveAuth() {\n  return true;\n}\n", "utf8");

    const index = new MemoryVectorIndex("demo-hydration");
    const embedder = new DeterministicFakeEmbedder({ dimensions: 8 });
    const indexer = new HydrationIndexer(repoRoot, index, embedder, {
      chunker: new LineTokenEstimateChunker({ maxLinesPerChunk: 2, maxEstimatedTokens: 20 }),
    });

    const first = await indexer.sync({ vectorBackend: "memory", normativeCommit: "abc123" });
    assert.equal(first.addedFiles, 3);
    assert.equal(first.updatedFiles, 0);
    assert.equal(first.removedFiles, 0);
    assert.ok(first.indexedChunks >= 4);

    const statePath = resolveHydrationArtifactPaths(repoRoot).indexStatePath;
    const stateAfterFirst = loadHydrationIndexState(statePath);
    assert.ok(stateAfterFirst);
    const removedChunkIds = stateAfterFirst?.indexed_files["src/util.ts"]?.chunk_ids ?? [];
    const oldAppChunkIds = stateAfterFirst?.indexed_files["src/app.ts"]?.chunk_ids ?? [];
    const symbolChunkIds = stateAfterFirst?.indexed_files["src/symbol.ts"]?.chunk_ids ?? [];
    const symbolRecords = await index.getByIds(symbolChunkIds);
    assert.ok(symbolRecords.some((record) => record.metadata?.symbol === "resolveAuth"));

    fs.writeFileSync(path.join(repoRoot, "src", "app.ts"), "one\ntwo updated\nthree\n", "utf8");
    fs.rmSync(path.join(repoRoot, "src", "util.ts"));

    const second = await indexer.sync({ vectorBackend: "memory", normativeCommit: "def456" });
    assert.equal(second.addedFiles, 0);
    assert.equal(second.updatedFiles, 1);
    assert.equal(second.removedFiles, 1);
    assert.equal(second.unchangedFiles, 1);
    assert.ok(second.deletedChunks >= removedChunkIds.length + oldAppChunkIds.length);

    const stateAfterSecond = loadHydrationIndexState(statePath);
    assert.ok(stateAfterSecond);
    assert.equal(stateAfterSecond?.normative_commit, "def456");
    assert.equal(stateAfterSecond?.indexed_files["src/util.ts"], undefined);
    const newAppChunkIds = stateAfterSecond?.indexed_files["src/app.ts"]?.chunk_ids ?? [];

    const removedRecords = await index.getByIds(removedChunkIds);
    assert.equal(removedRecords.length, 0);
    const staleAppChunkIds = oldAppChunkIds.filter((id) => !newAppChunkIds.includes(id));
    const staleAppRecords = await index.getByIds(staleAppChunkIds);
    assert.equal(staleAppRecords.length, 0);
  },
);
