import * as fs from "node:fs";
import * as path from "node:path";
import { TONIC_HUB_BLOB_PREFIX } from "./hubConstants";
import { requireHubWriteTokenUnlessOffline } from "./hubAuth";
import { hubWeaveOffline } from "./hubOffline";

function accessToken(): string {
  return (process.env.HF_TOKEN ?? "").trim();
}

function pushMaxCap(): number {
  const s = (process.env.TONIC_HF_WEAVE_PUSH_MAX ?? "").trim() || "0";
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Upload files in `.tonic/weave/blobs` (filename = sha256 key) under Hub `.tonic/hub/blobs/{key}`.
 * Mirrors `hub_push_local_blobs` in merge-tonic-lib.
 */
export async function hubPushLocalWeaveBlobs(params: {
  weaveBlobsDir: string;
  repoId: string;
}): Promise<number> {
  if (hubWeaveOffline()) {
    return 0;
  }
  const dir = params.weaveBlobsDir;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return 0;
  }
  let files = fs
    .readdirSync(dir)
    .filter((n) => fs.statSync(path.join(dir, n)).isFile())
    .sort();
  const cap = pushMaxCap();
  if (cap > 0) {
    files = files.slice(0, cap);
  }
  if (files.length === 0) {
    return 0;
  }
  requireHubWriteTokenUnlessOffline();
  const rid = params.repoId.trim();
  if (!rid) {
    return 0;
  }
  const token = accessToken();
  const { uploadFile } = await import("@huggingface/hub");
  let n = 0;
  for (const name of files) {
    const data = fs.readFileSync(path.join(dir, name));
    const hubPath = `${TONIC_HUB_BLOB_PREFIX}/${name}`;
    await uploadFile({
      repo: { type: "model", name: rid },
      file: { path: hubPath, content: new Blob([data]) },
      accessToken: token,
      commitTitle: `tonic hf-weave ${name.slice(0, 16)}…`,
    });
    n += 1;
  }
  return n;
}
