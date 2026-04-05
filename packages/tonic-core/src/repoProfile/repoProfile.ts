import * as fs from "node:fs";
import * as path from "node:path";

export const TONIC_REPO_PROFILE_SCHEMA = "tonic-repo-profile" as const;
export const TONIC_REPO_PROFILE_VERSION = "1" as const;
export const DEFAULT_REPO_PROFILE_REL = path.join(".tonic", "repo.json");

export type TonicRepoProfileV1 = {
  schema: typeof TONIC_REPO_PROFILE_SCHEMA;
  version: typeof TONIC_REPO_PROFILE_VERSION;
  remote: string;
  canonical_ref?: string;
  left_ref?: string;
  right_ref?: string;
  intent_pair?: string;
  intent_profile?: string;
  hydrate_out_dir?: string;
  git_remote_url?: string;
  hub_repo_id?: string;
  compare_mode?: "snapshot" | "weave";
};

export function defaultRepoProfile(): TonicRepoProfileV1 {
  return {
    schema: TONIC_REPO_PROFILE_SCHEMA,
    version: TONIC_REPO_PROFILE_VERSION,
    remote: "origin",
    canonical_ref: "",
    left_ref: "",
    right_ref: "",
    intent_pair: "",
    intent_profile: "",
    hydrate_out_dir: "",
    git_remote_url: "",
    hub_repo_id: "",
    compare_mode: "snapshot",
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse and validate minimal repo profile JSON. */
export function parseRepoProfileJson(raw: string): TonicRepoProfileV1 {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("repo profile: invalid JSON");
  }
  if (!isRecord(data)) {
    throw new Error("repo profile: root must be object");
  }
  if (data.schema !== TONIC_REPO_PROFILE_SCHEMA) {
    throw new Error(`repo profile: schema must be ${TONIC_REPO_PROFILE_SCHEMA}`);
  }
  if (data.version !== TONIC_REPO_PROFILE_VERSION) {
    throw new Error(`repo profile: version must be ${TONIC_REPO_PROFILE_VERSION}`);
  }
  if (typeof data.remote !== "string" || !data.remote.trim()) {
    throw new Error("repo profile: remote must be non-empty string");
  }
  const cm = data.compare_mode;
  if (cm !== undefined && cm !== "snapshot" && cm !== "weave") {
    throw new Error('repo profile: compare_mode must be "snapshot" or "weave"');
  }
  const base = defaultRepoProfile();
  for (const k of Object.keys(data)) {
    if (k in base || k === "git_remote_url" || k === "hub_repo_id") {
      (base as Record<string, unknown>)[k] = data[k];
    }
  }
  base.remote = String(data.remote).trim();
  return base as TonicRepoProfileV1;
}

/** Deep merge: non-empty string values in `patch` override `base`. */
export function mergeRepoProfiles(base: TonicRepoProfileV1, patch: Partial<TonicRepoProfileV1>): TonicRepoProfileV1 {
  const out: TonicRepoProfileV1 = { ...defaultRepoProfile(), ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) {
      continue;
    }
    if (typeof v === "string") {
      if (v.trim() !== "") {
        (out as Record<string, unknown>)[k] = v.trim();
      }
      continue;
    }
    if (k === "compare_mode" && (v === "snapshot" || v === "weave")) {
      out.compare_mode = v;
    }
  }
  out.schema = TONIC_REPO_PROFILE_SCHEMA;
  out.version = TONIC_REPO_PROFILE_VERSION;
  return out;
}

export function repoProfilePath(repoRoot: string, rel = DEFAULT_REPO_PROFILE_REL): string {
  return path.join(repoRoot, rel);
}

export function readRepoProfile(repoRoot: string): TonicRepoProfileV1 | null {
  const p = repoProfilePath(repoRoot);
  if (!fs.existsSync(p)) {
    return null;
  }
  return parseRepoProfileJson(fs.readFileSync(p, "utf8"));
}

export function writeRepoProfile(repoRoot: string, profile: TonicRepoProfileV1, rel = DEFAULT_REPO_PROFILE_REL): void {
  const p = repoProfilePath(repoRoot, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const body = JSON.stringify(profile, null, 2) + "\n";
  fs.writeFileSync(p, body, "utf8");
}

/** All ref-like strings from profile used for fetch (deduped, non-empty). */
export function refsToFetchFromProfile(p: TonicRepoProfileV1): string[] {
  const s = new Set<string>();
  for (const r of [p.canonical_ref, p.left_ref, p.right_ref]) {
    const t = (r ?? "").trim();
    if (t) {
      s.add(t);
    }
  }
  return [...s];
}
