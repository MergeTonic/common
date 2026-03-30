import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { HYDRATION_PIPELINE_VERSION } from "./types";
import { DEFAULT_INDEX_STATE_FILE_NAME } from "./paths";
import { HydrationPersistError } from "./errors";

export const HYDRATION_PERSIST_MANIFEST_SCHEMA = "tonic-hydration-persist-manifest";
export const HYDRATION_PERSIST_MANIFEST_FILE_NAME = "persist-manifest.json";
export const HYDRATION_PERSIST_LOCK_FILE_NAME = ".writer.lock";
export const HYDRATION_CACHE_KEY_SCHEMA_VERSION = "1";

export type HydrationPersistManifest = {
  schema: typeof HYDRATION_PERSIST_MANIFEST_SCHEMA;
  pipeline_version: string;
  persist_root: string;
  index_state_file: string;
  writer_kind: string;
  cache_key?: string;
  entries: string[];
  updated_at: string;
};

export type HydrationPersistHealth = {
  ok: boolean;
  coldStart: boolean;
  hasIndexState: boolean;
  hasStoreFiles: boolean;
  entries: string[];
  manifestPath: string;
  reason?: string;
  missingEntries?: string[];
};

export type HydrationCacheKeyParts = {
  strategyId: string;
  prIdentifiers?: string[];
  embedderModel: string;
  chunkerVersion: string;
  scope?: string;
  promptProfile?: string;
  dryRun?: boolean;
  historicalSince?: string;
  historicalBaseRef?: string;
  historicalState?: "merged" | "open" | "all";
};

export type HydrationCacheKey = {
  cacheKey: string;
  prListHash: string;
  payload: {
    schema_version: string;
    strategy_id: string;
    pr_list_hash: string;
    embedder_model: string;
    chunker_version: string;
    scope: string;
    prompt_profile: string;
    dry_run: "true" | "false";
    historical_since: string;
    historical_base_ref: string;
    historical_state: string;
  };
};

export type HydrationPersistLock = {
  lockPath: string;
  token: string;
  release(): void;
};

function normalizePrIdentifiers(values: string[] | undefined): string[] {
  return [...(values ?? [])].map((value) => value.trim()).filter(Boolean).sort();
}

function listPersistEntries(persistRoot: string): string[] {
  if (!fs.existsSync(persistRoot)) {
    return [];
  }
  return fs.readdirSync(persistRoot).sort();
}

function hasStoreFiles(entries: string[]): boolean {
  return entries.some((entry) =>
    ![
      DEFAULT_INDEX_STATE_FILE_NAME,
      HYDRATION_PERSIST_MANIFEST_FILE_NAME,
      HYDRATION_PERSIST_LOCK_FILE_NAME,
    ].includes(entry),
  );
}

export function buildHydrationCacheKey(parts: HydrationCacheKeyParts): HydrationCacheKey {
  const prIdentifiers = normalizePrIdentifiers(parts.prIdentifiers);
  const prListHash = createHash("sha256").update(prIdentifiers.join("\n"), "utf8").digest("hex");
  const payload = {
    schema_version: HYDRATION_CACHE_KEY_SCHEMA_VERSION,
    strategy_id: parts.strategyId,
    pr_list_hash: prListHash,
    embedder_model: parts.embedderModel,
    chunker_version: parts.chunkerVersion,
    scope: (parts.scope ?? "").trim(),
    prompt_profile: (parts.promptProfile ?? "").trim(),
    dry_run: parts.dryRun ? "true" as const : "false" as const,
    historical_since: (parts.historicalSince ?? "").trim(),
    historical_base_ref: (parts.historicalBaseRef ?? "").trim(),
    historical_state: (parts.historicalState ?? "").trim(),
  };
  return {
    cacheKey: createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex"),
    prListHash,
    payload,
  };
}

export function resolveHydrationPersistManifestPath(persistRoot: string): string {
  return path.join(persistRoot, HYDRATION_PERSIST_MANIFEST_FILE_NAME);
}

export function writeHydrationPersistManifest(params: {
  persistRoot: string;
  writerKind: string;
  cacheKey?: string;
  indexStateFile?: string;
}): HydrationPersistManifest {
  fs.mkdirSync(params.persistRoot, { recursive: true });
  const manifestPath = resolveHydrationPersistManifestPath(params.persistRoot);
  const entries = listPersistEntries(params.persistRoot).filter((entry) => entry !== HYDRATION_PERSIST_LOCK_FILE_NAME);
  const manifest: HydrationPersistManifest = {
    schema: HYDRATION_PERSIST_MANIFEST_SCHEMA,
    pipeline_version: HYDRATION_PIPELINE_VERSION,
    persist_root: params.persistRoot,
    index_state_file: params.indexStateFile ?? DEFAULT_INDEX_STATE_FILE_NAME,
    writer_kind: params.writerKind,
    cache_key: params.cacheKey,
    entries,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

export function loadHydrationPersistManifest(persistRoot: string): HydrationPersistManifest | null {
  const manifestPath = resolveHydrationPersistManifestPath(persistRoot);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as HydrationPersistManifest;
}

export function checkHydrationPersistHealth(persistRoot: string): HydrationPersistHealth {
  const manifestPath = resolveHydrationPersistManifestPath(persistRoot);
  const entries = listPersistEntries(persistRoot);
  const indexStateFile = DEFAULT_INDEX_STATE_FILE_NAME;
  const hasIndexState = entries.includes(indexStateFile);
  const storeFilesPresent = hasStoreFiles(entries);
  if (entries.length === 0) {
    return {
      ok: true,
      coldStart: true,
      hasIndexState: false,
      hasStoreFiles: false,
      entries,
      manifestPath,
    };
  }
  if (storeFilesPresent && !hasIndexState) {
    return {
      ok: false,
      coldStart: false,
      hasIndexState,
      hasStoreFiles: storeFilesPresent,
      entries,
      manifestPath,
      reason: "Persist root has Chroma files but no index-state.json. Restore the full tree or rebuild the cache.",
    };
  }
  const manifest = loadHydrationPersistManifest(persistRoot);
  if (!manifest) {
    return {
      ok: !storeFilesPresent && !hasIndexState,
      coldStart: !storeFilesPresent && !hasIndexState,
      hasIndexState,
      hasStoreFiles: storeFilesPresent,
      entries,
      manifestPath,
      reason:
        storeFilesPresent || hasIndexState ?
          "Persist root is missing persist-manifest.json. Rebuild the persisted Chroma tree instead of restoring partial files."
        : undefined,
    };
  }
  const missingEntries = manifest.entries.filter((entry) => !fs.existsSync(path.join(persistRoot, entry)));
  if (missingEntries.length > 0) {
    return {
      ok: false,
      coldStart: false,
      hasIndexState,
      hasStoreFiles: storeFilesPresent,
      entries,
      manifestPath,
      missingEntries,
      reason: `Persist root is missing required entries from ${HYDRATION_PERSIST_MANIFEST_FILE_NAME}. Restore the full tree or rebuild the cache.`,
    };
  }
  return {
    ok: true,
    coldStart: false,
    hasIndexState,
    hasStoreFiles: storeFilesPresent,
    entries,
    manifestPath,
  };
}

export function assertHydrationPersistHealth(persistRoot: string): HydrationPersistHealth {
  const health = checkHydrationPersistHealth(persistRoot);
  if (!health.ok) {
    throw new HydrationPersistError(health.reason ?? "Hydration persist root is not safe to reuse.");
  }
  return health;
}

export function acquireHydrationPersistLock(persistRoot: string, owner: string): HydrationPersistLock {
  fs.mkdirSync(persistRoot, { recursive: true });
  const lockPath = path.join(persistRoot, HYDRATION_PERSIST_LOCK_FILE_NAME);
  const token = randomUUID();
  const payload = {
    owner,
    token,
    pid: process.pid,
    acquired_at: new Date().toISOString(),
  };
  try {
    const fd = fs.openSync(lockPath, "wx");
    try {
      fs.writeFileSync(fd, JSON.stringify(payload, null, 2) + "\n", "utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    let detail = "";
    if (fs.existsSync(lockPath)) {
      detail = fs.readFileSync(lockPath, "utf8").trim();
    }
    throw new HydrationPersistError(
      `Hydration persist root is already claimed by another writer at ${lockPath}.${detail ? ` Existing lock: ${detail}` : ""}`,
    );
  }
  return {
    lockPath,
    token,
    release(): void {
      if (!fs.existsSync(lockPath)) {
        return;
      }
      try {
        const current = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { token?: string };
        if (current.token !== token) {
          return;
        }
      } catch {
        return;
      }
      fs.unlinkSync(lockPath);
    },
  };
}
