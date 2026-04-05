import * as fs from "node:fs";
import * as path from "node:path";
import { TONIC_HUB_BLOB_PREFIX } from "./hubConstants";
import { hubWeaveOffline } from "./hubOffline";

function accessToken(): string {
  return (process.env.HF_TOKEN ?? "").trim();
}

/** Download listed blob keys from Hub into destDir (flat filenames). Mirrors `hub_prefetch_keys`. */
export async function hubPrefetchBlobKeys(params: {
  keys: string[];
  repoId: string;
  destDir: string;
}): Promise<number> {
  if (hubWeaveOffline()) {
    return 0;
  }
  const rid = params.repoId.trim();
  if (!rid) {
    return 0;
  }
  const token = accessToken();
  if (!token) {
    return 0;
  }
  fs.mkdirSync(params.destDir, { recursive: true });
  const { downloadFile } = await import("@huggingface/hub");
  let n = 0;
  for (const key of params.keys) {
    const hubPath = `${TONIC_HUB_BLOB_PREFIX}/${key}`;
    try {
      const res = await downloadFile({
        repo: { type: "model", name: rid },
        path: hubPath,
        accessToken: token,
      });
      if (!res) {
        continue;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      fs.writeFileSync(path.join(params.destDir, key), buf);
      n += 1;
    } catch {
      /* skip missing keys */
    }
  }
  return n;
}
