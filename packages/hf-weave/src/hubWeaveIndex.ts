import * as fs from "node:fs";
import * as path from "node:path";
import { hubDownloadRepoPath, hubUploadBytes } from "./hubRepoFiles";
import { hubWeaveOffline } from "./hubOffline";

export const WEAVE_INDEX_HUB_PATH = ".tonic/hub/weave-index.v1.json";

export type HubIndexObjectMeta = {
  sha256: string;
  size_bytes: number;
  content_type?: string;
  hub_path?: string;
  updated_at?: string;
};

export function hubIndexEmpty(repoId: string): Record<string, unknown> {
  return {
    schema: "tonic-weave-hub-index",
    version: "1",
    repo_id: repoId,
    objects: {},
  };
}

export function parseHubIndex(raw: string): Record<string, unknown> {
  const data: unknown = JSON.parse(raw);
  if (typeof data !== "object" || data === null) {
    throw new Error("hub index: root must be object");
  }
  const o = data as Record<string, unknown>;
  if (o.schema !== "tonic-weave-hub-index") {
    throw new Error("hub index: invalid schema");
  }
  if (o.version !== "1") {
    throw new Error("hub index: invalid version");
  }
  const objs = o.objects;
  if (objs !== undefined && (typeof objs !== "object" || objs === null || Array.isArray(objs))) {
    throw new Error("hub index: objects must be object");
  }
  return o;
}

export function loadHubIndexLocal(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return parseHubIndex(fs.readFileSync(filePath, "utf8"));
}

export function mergeHubIndexLww(...indices: Record<string, unknown>[]): Record<string, unknown> {
  if (indices.length === 0) {
    return hubIndexEmpty("");
  }
  let repoId = "";
  for (const idx of indices) {
    const rid = idx.repo_id;
    if (typeof rid === "string" && rid.trim()) {
      repoId = rid.trim();
      break;
    }
  }
  const out = hubIndexEmpty(repoId);
  const merged: Record<string, Record<string, unknown>> = {};
  const bestTs: Record<string, string> = {};
  for (const idx of indices) {
    const objs = idx.objects;
    if (typeof objs !== "object" || objs === null || Array.isArray(objs)) {
      continue;
    }
    for (const [k, meta] of Object.entries(objs as Record<string, unknown>)) {
      if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
        continue;
      }
      const m = meta as Record<string, unknown>;
      const ts = String(m.updated_at ?? "");
      const prev = bestTs[k] ?? "";
      if (ts >= prev) {
        bestTs[k] = ts;
        merged[k] = { ...m };
      }
    }
  }
  (out as Record<string, unknown>).objects = merged;
  const last = indices[indices.length - 1]!;
  const rev = last.revision;
  if (typeof rev === "string" && rev.trim()) {
    out.revision = rev.trim();
  }
  return out;
}

function isoZNow(): string {
  const d = new Date();
  const iso = d.toISOString().replace(/\.\d{3}Z$/, "Z");
  return iso;
}

export function indexEntryForBlob(key: string, data: Uint8Array, contentType = "application/octet-stream"): HubIndexObjectMeta {
  return {
    sha256: key,
    size_bytes: data.byteLength,
    content_type: contentType,
    hub_path: `.tonic/hub/blobs/${key}`,
    updated_at: isoZNow(),
  };
}

function sortJsonKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortJsonKeysDeep);
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = sortJsonKeysDeep(o[k]);
  }
  return out;
}

export function saveHubIndexLocal(filePath: string, index: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sorted = sortJsonKeysDeep(index) as Record<string, unknown>;
  fs.writeFileSync(filePath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

/**
 * Merge remote + local + disk-derived index; save under `.tonic/hub/weave-index.v1.json` and upload.
 * Mirrors `refresh_weave_hub_index` in merge-tonic-lib.
 */
export async function refreshWeaveHubIndex(params: {
  repoRoot: string;
  repoId: string;
}): Promise<Record<string, unknown>> {
  const rid = params.repoId.trim();
  const off = hubWeaveOffline();
  const hubDir = path.join(params.repoRoot, ".tonic", "hub");
  const localPath = path.join(hubDir, "weave-index.v1.json");

  let remoteIdx: Record<string, unknown> | null = null;
  if (rid && !off) {
    const raw = await hubDownloadRepoPath({ repoId: rid, pathInRepo: WEAVE_INDEX_HUB_PATH });
    if (raw) {
      try {
        remoteIdx = parseHubIndex(new TextDecoder().decode(raw));
      } catch {
        remoteIdx = null;
      }
    }
  }

  const localIdx = loadHubIndexLocal(localPath);
  const manifestPath = path.join(params.repoRoot, ".tonic", "weave", "manifest.json");
  const diskIdx = hubIndexEmpty(rid || "");

  if (fs.existsSync(manifestPath)) {
    try {
      const man: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const m = man as Record<string, unknown>;
      const paths = m.paths;
      if (typeof paths === "object" && paths !== null && !Array.isArray(paths)) {
        const blobsDir = path.join(params.repoRoot, ".tonic", "weave", "blobs");
        const diskObjects = diskIdx.objects as Record<string, Record<string, unknown>>;
        for (const ent of Object.values(paths as Record<string, unknown>)) {
          if (typeof ent !== "object" || ent === null) {
            continue;
          }
          const e = ent as Record<string, unknown>;
          const sha = e.weave_serialized_sha;
          if (typeof sha !== "string" || sha.length !== 64) {
            continue;
          }
          const bp = path.join(blobsDir, sha);
          if (fs.existsSync(bp) && fs.statSync(bp).isFile()) {
            const data = fs.readFileSync(bp);
            diskObjects[sha] = indexEntryForBlob(sha, data) as unknown as Record<string, unknown>;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const parts = [remoteIdx, localIdx, diskIdx].filter((x): x is Record<string, unknown> => x !== null);
  const merged = parts.length > 0 ? mergeHubIndexLww(...parts) : hubIndexEmpty(rid || "");
  merged.repo_id = rid || String(merged.repo_id ?? "");

  fs.mkdirSync(hubDir, { recursive: true });
  saveHubIndexLocal(localPath, merged);

  if (rid && !off) {
    const payload = new TextEncoder().encode(`${JSON.stringify(sortJsonKeysDeep(merged), null, 2)}\n`);
    await hubUploadBytes({
      repoId: rid,
      pathInRepo: WEAVE_INDEX_HUB_PATH,
      data: payload,
      commitMessage: "tonic weave index update",
    });
  }

  return merged;
}
