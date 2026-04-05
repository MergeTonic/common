import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { HF_WEAVE_HUB_TOKEN_REQUIRED_CODE, requireHubWriteTokenUnlessOffline } from "../hubAuth";
import { hubPushLocalWeaveBlobs } from "../hubPushBlobs";
import { hubUploadBytes } from "../hubRepoFiles";

test("requireHubWriteTokenUnlessOffline throws when online and HF_TOKEN empty", () => {
  const saved = process.env.HF_TOKEN;
  const savedOff = process.env.HF_HUB_OFFLINE;
  delete process.env.HF_TOKEN;
  delete process.env.HF_HUB_OFFLINE;
  try {
    assert.throws(
      () => requireHubWriteTokenUnlessOffline(),
      (e: unknown) => e instanceof Error && e.message.includes(HF_WEAVE_HUB_TOKEN_REQUIRED_CODE),
    );
  } finally {
    if (saved !== undefined) process.env.HF_TOKEN = saved;
    else delete process.env.HF_TOKEN;
    if (savedOff !== undefined) process.env.HF_HUB_OFFLINE = savedOff;
    else delete process.env.HF_HUB_OFFLINE;
  }
});

test("requireHubWriteTokenUnlessOffline no-op when offline", () => {
  const saved = process.env.HF_TOKEN;
  const savedOff = process.env.HF_HUB_OFFLINE;
  delete process.env.HF_TOKEN;
  process.env.HF_HUB_OFFLINE = "1";
  try {
    requireHubWriteTokenUnlessOffline();
  } finally {
    if (saved !== undefined) process.env.HF_TOKEN = saved;
    else delete process.env.HF_TOKEN;
    if (savedOff !== undefined) process.env.HF_HUB_OFFLINE = savedOff;
    else delete process.env.HF_HUB_OFFLINE;
  }
});

test("hubPushLocalWeaveBlobs rejects when non-empty blobs dir, online, no token", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-weave-push-"));
  const blobs = path.join(dir, "blobs");
  fs.mkdirSync(blobs, { recursive: true });
  fs.writeFileSync(path.join(blobs, "a".repeat(64)), "blob");
  const savedT = process.env.HF_TOKEN;
  const savedO = process.env.HF_HUB_OFFLINE;
  delete process.env.HF_TOKEN;
  delete process.env.HF_HUB_OFFLINE;
  try {
    await assert.rejects(
      () => hubPushLocalWeaveBlobs({ weaveBlobsDir: blobs, repoId: "x/y" }),
      (e: unknown) => e instanceof Error && e.message.includes(HF_WEAVE_HUB_TOKEN_REQUIRED_CODE),
    );
  } finally {
    if (savedT !== undefined) process.env.HF_TOKEN = savedT;
    else delete process.env.HF_TOKEN;
    if (savedO !== undefined) process.env.HF_HUB_OFFLINE = savedO;
    else delete process.env.HF_HUB_OFFLINE;
  }
});

test("hubPushLocalWeaveBlobs returns 0 for empty blobs dir without token", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-weave-empty-"));
  const blobs = path.join(dir, "blobs");
  fs.mkdirSync(blobs, { recursive: true });
  const savedT = process.env.HF_TOKEN;
  delete process.env.HF_TOKEN;
  delete process.env.HF_HUB_OFFLINE;
  try {
    const n = await hubPushLocalWeaveBlobs({ weaveBlobsDir: blobs, repoId: "x/y" });
    assert.equal(n, 0);
  } finally {
    if (savedT !== undefined) process.env.HF_TOKEN = savedT;
    else delete process.env.HF_TOKEN;
  }
});

test("hubUploadBytes rejects when online and no token", async () => {
  const savedT = process.env.HF_TOKEN;
  const savedO = process.env.HF_HUB_OFFLINE;
  delete process.env.HF_TOKEN;
  delete process.env.HF_HUB_OFFLINE;
  try {
    await assert.rejects(
      () =>
        hubUploadBytes({
          repoId: "a/b",
          pathInRepo: "p",
          data: new Uint8Array([1]),
          commitMessage: "m",
        }),
      (e: unknown) => e instanceof Error && e.message.includes(HF_WEAVE_HUB_TOKEN_REQUIRED_CODE),
    );
  } finally {
    if (savedT !== undefined) process.env.HF_TOKEN = savedT;
    else delete process.env.HF_TOKEN;
    if (savedO !== undefined) process.env.HF_HUB_OFFLINE = savedO;
    else delete process.env.HF_HUB_OFFLINE;
  }
});
