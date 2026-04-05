import { createHash } from "node:crypto";

import { hubDownloadRepoPath, hubUploadBytes } from "./hubRepoFiles";
import { requireHubWriteTokenUnlessOffline } from "./hubAuth";
import { hubWeaveOffline } from "./hubOffline";

export const CTRD_SCHEMA = "tonic-weave-trace-replay";
export const CTRD_VERSION = "1";
export const TRACE_PREFIX = ".tonic/hub/traces";

export function ctrdHubPath(ctrdId: string): string {
  return `${TRACE_PREFIX}/${ctrdId}.json`;
}

export type CtRdStep = { commit: string; lines: string[] };

/** Deep key sort for JSON matching Python ``json.dumps(..., sort_keys=True)``. */
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

/**
 * Deterministic JSON for CTRD id: sorted keys, `,`/`:` separators with no spaces, and string scalars
 * emitted as UTF-8 (matches Python ``json.dumps(..., sort_keys=True, separators=(',', ':'), ensure_ascii=False)``).
 * Default ``JSON.stringify`` is unsuitable because it escapes non-ASCII as ``\\uXXXX``.
 */
function jsonEncodeStringUtf8NoAsciiEscape(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const cu = s.charCodeAt(i);
    if (cu === 0x22) {
      out += '\\"';
    } else if (cu === 0x5c) {
      out += "\\\\";
    } else if (cu < 0x20) {
      if (cu === 0x08) {
        out += "\\b";
      } else if (cu === 0x0c) {
        out += "\\f";
      } else if (cu === 0x0a) {
        out += "\\n";
      } else if (cu === 0x0d) {
        out += "\\r";
      } else if (cu === 0x09) {
        out += "\\t";
      } else {
        out += `\\u${cu.toString(16).padStart(4, "0")}`;
      }
    } else if (cu >= 0xd800 && cu <= 0xdbff && i + 1 < s.length) {
      const low = s.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        out += s.slice(i, i + 2);
        i++;
      } else {
        out += `\\u${cu.toString(16).padStart(4, "0")}`;
      }
    } else if (cu >= 0xd800 && cu <= 0xdfff) {
      out += `\\u${cu.toString(16).padStart(4, "0")}`;
    } else {
      out += String.fromCharCode(cu);
    }
  }
  return `${out}"`;
}

function jsonEncodeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error("ctrd hash: non-finite number");
  }
  return JSON.stringify(n);
}

function serializeJsonCanonical(value: unknown): string {
  if (value === null) {
    return "null";
  }
  const t = typeof value;
  if (t === "boolean") {
    return value ? "true" : "false";
  }
  if (t === "number") {
    return jsonEncodeNumber(value as number);
  }
  if (t === "string") {
    return jsonEncodeStringUtf8NoAsciiEscape(value as string);
  }
  if (Array.isArray(value)) {
    return `[${value.map((x) => serializeJsonCanonical(x)).join(",")}]`;
  }
  if (t === "object") {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${jsonEncodeStringUtf8NoAsciiEscape(k)}:${serializeJsonCanonical(o[k])}`).join(",")}}`;
  }
  throw new Error("ctrd hash: unsupported JSON value type");
}

export function jsonForCtRdHash(body: Record<string, unknown>): string {
  return serializeJsonCanonical(sortJsonKeysDeep(body));
}

export function canonicalCtRdPayloadForHash(params: {
  manifestCommit: string;
  path: string;
  steps: CtRdStep[];
  diffEngineId: string;
  weaveFormatVersion: string;
  expectedWeaveSerializedSha?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    schema: CTRD_SCHEMA,
    version: CTRD_VERSION,
    manifest_commit: params.manifestCommit,
    path: params.path,
    steps: params.steps.map((s) => ({ commit: s.commit, lines: s.lines })),
    diff_engine_id: params.diffEngineId,
    weave_format_version: params.weaveFormatVersion,
  };
  if (params.expectedWeaveSerializedSha) {
    body.expected_weave_serialized_sha = params.expectedWeaveSerializedSha;
  }
  return body;
}

export function ctrdIdFromPayload(body: Record<string, unknown>): string {
  const raw = jsonForCtRdHash(body);
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function buildCtRdDocument(params: {
  manifestCommit: string;
  path: string;
  steps: CtRdStep[];
  diffEngineId: string;
  weaveFormatVersion: string;
  expectedWeaveSerializedSha?: string;
}): { ctrdId: string; doc: Record<string, unknown> } {
  const body = canonicalCtRdPayloadForHash(params);
  const ctrdId = ctrdIdFromPayload(body);
  const doc = { ...body, ctrd_id: ctrdId };
  return { ctrdId, doc };
}

/** Pretty JSON for Hub upload (Python ``ctrd_document_json``: indent=2, sort_keys, trailing newline). */
export function ctrdDocumentJson(doc: Record<string, unknown>): string {
  const sorted = sortJsonKeysDeep(doc) as Record<string, unknown>;
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export async function fetchCtRdFromHub(repoId: string, ctrdId: string): Promise<Record<string, unknown> | null> {
  const raw = await hubDownloadRepoPath({ repoId: repoId.trim(), pathInRepo: ctrdHubPath(ctrdId) });
  if (!raw) {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  return data as Record<string, unknown>;
}

/** Upload CTRD JSON; mirrors `publish_ctrd_to_hub` (offline: no-op, returns id). */
export async function publishCtRdToHub(repoId: string, doc: Record<string, unknown>): Promise<string> {
  const id = String(doc.ctrd_id ?? "");
  if (id.length !== 64) {
    throw new Error("publishCtRdToHub: invalid ctrd_id");
  }
  if (hubWeaveOffline()) {
    return id;
  }
  requireHubWriteTokenUnlessOffline();
  const data = new TextEncoder().encode(ctrdDocumentJson(doc));
  await hubUploadBytes({
    repoId: repoId.trim(),
    pathInRepo: ctrdHubPath(id),
    data,
    commitMessage: `tonic ctrd ${id.slice(0, 12)}…`,
  });
  return id;
}
