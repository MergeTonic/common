import type { PathManifestEntry, TonicGitManifest } from "./types";
import { normalizeLf, sha256HexBytes, sha256HexUtf8 } from "./hashutil";

function assertManifest(cond: boolean, msg: string): void {
  if (!cond) {
    throw new Error(msg);
  }
}

export function parseManifestJson(raw: string): TonicGitManifest {
  const data = JSON.parse(raw) as unknown;
  assertManifest(typeof data === "object" && data !== null, "manifest root must be object");
  const o = data as Record<string, unknown>;
  assertManifest(o.schema === "tonic-git-manifest", "manifest.schema must be tonic-git-manifest");
  assertManifest(o.version === "1", "manifest.version must be 1");
  assertManifest(typeof o.commit === "string" && o.commit.length > 0, "manifest.commit required");
  const paths = o.paths;
  assertManifest(typeof paths === "object" && paths !== null, "manifest.paths must be object");
  for (const [rel, row] of Object.entries(paths as Record<string, unknown>)) {
    assertManifest(typeof row === "object" && row !== null, `path ${rel}: entry must be object`);
    const pe = row as Record<string, unknown>;
    for (const k of ["text_blob_sha", "weave_serialized_sha", "weave_format_version", "diff_engine_id"]) {
      assertManifest(typeof pe[k] === "string" && (pe[k] as string).length > 0, `path ${rel}: missing ${k}`);
    }
    const pw = pe.parent_weave_shas;
    if (pw !== undefined && pw !== null) {
      assertManifest(Array.isArray(pw), `path ${rel}: parent_weave_shas must be array`);
      for (const x of pw as unknown[]) {
        assertManifest(
          typeof x === "string" && x.length > 0,
          `path ${rel}: parent weave sha must be non-empty string`,
        );
      }
    }
  }
  return data as TonicGitManifest;
}

/** Deep-sort object keys for JSON matching Python ``json.dumps(..., sort_keys=True)``. */
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

export function serializeManifestJson(manifest: TonicGitManifest, indent = 2): string {
  const sorted = sortJsonKeysDeep(manifest) as TonicGitManifest;
  return JSON.stringify(sorted, null, indent) + (indent ? "\n" : "");
}

export function pathEntryForFile(params: {
  relPath: string;
  textCanonical: string;
  serializedWeave: string;
  weaveFormatVersion: string;
  diffEngineId: string;
  parentWeaveShas?: string[];
  degraded?: boolean;
  squash?: boolean;
}): [string, PathManifestEntry] {
  const norm = normalizeLf(params.textCanonical);
  const textSha = sha256HexUtf8(norm);
  const weaveBytes = Buffer.from(params.serializedWeave, "utf8");
  const weaveSha = sha256HexBytes(weaveBytes);
  const entry: PathManifestEntry = {
    text_blob_sha: textSha,
    weave_serialized_sha: weaveSha,
    weave_format_version: params.weaveFormatVersion,
    diff_engine_id: params.diffEngineId,
  };
  if (params.parentWeaveShas !== undefined) {
    entry.parent_weave_shas = params.parentWeaveShas;
  }
  if (params.degraded !== undefined) {
    entry.degraded = params.degraded;
  }
  if (params.squash !== undefined) {
    entry.squash = params.squash;
  }
  return [params.relPath, entry];
}
