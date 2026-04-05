import * as fs from "node:fs";
import * as path from "node:path";

const BLOB_PREFIX = ".tonic/hub/blobs";

/** Download weave blob keys from a Hub model repo into a flat local directory (idempotent). */
export async function prefetchHubBlobsToDir(options: {
  repoId: string;
  keys: string[];
  destDir: string;
  token?: string;
}): Promise<number> {
  const token = (options.token ?? process.env.HF_TOKEN ?? "").trim();
  if (!token) {
    return 0;
  }
  fs.mkdirSync(options.destDir, { recursive: true });
  let n = 0;
  for (const key of options.keys) {
    if (!/^[0-9a-f]{64}$/i.test(key)) {
      continue;
    }
    const out = path.join(options.destDir, key);
    if (fs.existsSync(out)) {
      continue;
    }
    const url = `https://huggingface.co/${options.repoId}/resolve/main/${BLOB_PREFIX}/${key}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(out, buf);
    n++;
  }
  return n;
}
