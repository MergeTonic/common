import * as fs from "node:fs";
import * as path from "node:path";

import { initialState } from "../core";
import { canonicalTextLines, normalizeLf } from "./hashutil";
import { loadStateFromWeaveRoot, runOptionAMerge } from "./mergeDriver";
import { parseManifestJson, pathEntryForFile, serializeManifestJson } from "./manifest";
import { persistCheckpointWeaveBlob } from "./replay";
import type { PathManifestEntry, TonicGitManifest } from "./types";

const DEFAULT_WEAVE_FORMAT_VERSION = "1";
const DEFAULT_DIFF_ENGINE_ID = "tonic-v1";

export function entryEngineVersion(
  entry: Record<string, unknown> | PathManifestEntry | null | undefined,
  wfv: string,
  did: string,
): [string, string] {
  if (entry && typeof entry === "object") {
    const ev = entry.weave_format_version;
    const ed = entry.diff_engine_id;
    if (typeof ev === "string" && ev.trim()) {
      wfv = ev.trim();
    }
    if (typeof ed === "string" && ed.trim()) {
      did = ed.trim();
    }
  }
  return [wfv, did];
}

export function rootEngineVersion(manifest: TonicGitManifest): [string, string] {
  const wf = manifest.weave_format_version;
  const de = manifest.diff_engine_id;
  const wfv =
    typeof wf === "string" && wf.trim() ? wf.trim() : DEFAULT_WEAVE_FORMAT_VERSION;
  const did = typeof de === "string" && de.trim() ? de.trim() : DEFAULT_DIFF_ENGINE_ID;
  return [wfv, did];
}

/**
 * Mode B: `merge_states` on blobs under `.tonic/weave/blobs`.
 * Returns annotated lines, manifest entry, serialized weave, stderr (parity with Python `merge_three_weave_driver`).
 */
export function mergeThreeWeaveDriver(params: {
  repoRoot: string;
  relPath: string;
  textBase: string;
  textLeft: string;
  textRight: string;
  entBase: PathManifestEntry | null | undefined;
  entLeft: PathManifestEntry | null | undefined;
  entRight: PathManifestEntry | null | undefined;
  weaveFormatVersion: string;
  diffEngineId: string;
  strict?: boolean;
}): [string[], PathManifestEntry | null, string | null, string[]] {
  const weaveRoot = path.join(params.repoRoot, ".tonic", "weave");

  function loadB(): string | null {
    const w = params.entBase?.weave_serialized_sha;
    return typeof w === "string" && w ? loadStateFromWeaveRoot(weaveRoot, w) : null;
  }
  function loadL(): string | null {
    const w = params.entLeft?.weave_serialized_sha;
    return typeof w === "string" && w ? loadStateFromWeaveRoot(weaveRoot, w) : null;
  }
  function loadR(): string | null {
    const w = params.entRight?.weave_serialized_sha;
    return typeof w === "string" && w ? loadStateFromWeaveRoot(weaveRoot, w) : null;
  }

  const res = runOptionAMerge({
    textBase: params.textBase,
    textOurs: params.textLeft,
    textTheirs: params.textRight,
    loadStateBase: loadB,
    loadStateOurs: loadL,
    loadStateTheirs: loadR,
    weaveFormatVersion: params.weaveFormatVersion,
    diffEngineId: params.diffEngineId,
    strict: params.strict,
    manifestEntryBase: params.entBase ?? null,
    manifestEntryOurs: params.entLeft ?? null,
    manifestEntryTheirs: params.entRight ?? null,
  });

  const stderr = [...res.stderr];
  if (res.manifestEntry === null || res.serializedWeave === null) {
    return [[], null, null, stderr];
  }
  const text = res.mergedText;
  let lines: string[];
  if (text.endsWith("\n")) {
    const body = text.slice(0, -1);
    lines = body ? body.split("\n") : [];
  } else {
    lines = text ? text.split("\n") : [];
  }
  if (lines.length && lines[lines.length - 1] === "") {
    lines = lines.slice(0, -1);
  }

  const entry = { ...res.manifestEntry };
  const parents: string[] = [];
  const wl = params.entLeft?.weave_serialized_sha;
  const wr = params.entRight?.weave_serialized_sha;
  if (typeof wl === "string") {
    parents.push(wl);
  }
  if (typeof wr === "string") {
    parents.push(wr);
  }
  const [, fixed] = pathEntryForFile({
    relPath: params.relPath,
    textCanonical: normalizeLf(text),
    serializedWeave: res.serializedWeave,
    weaveFormatVersion: params.weaveFormatVersion,
    diffEngineId: params.diffEngineId,
    parentWeaveShas: parents.length ? parents : undefined,
    degraded: Boolean(entry.degraded),
  });
  return [lines, fixed, res.serializedWeave, stderr];
}

export function loadOrInitManifest(manifestPath: string, headCommit: string): TonicGitManifest {
  if (fs.existsSync(manifestPath)) {
    try {
      return parseManifestJson(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      /* fall through */
    }
  }
  return {
    schema: "tonic-git-manifest",
    version: "1",
    commit: headCommit,
    paths: {},
  };
}

/** Mode A (text): Tonic-annotated merge file + snapshot `initialState` weave row (`degraded`). */
export function buildCompareThreeTextModeEntry(params: {
  relPath: string;
  annotatedLines: string[];
  weaveFormatVersion: string;
  diffEngineId: string;
  parentWeaveShas?: string[];
}): { entry: PathManifestEntry; serialized: string } {
  const body = params.annotatedLines.join("\n") + (params.annotatedLines.length ? "\n" : "");
  const lines = canonicalTextLines(body);
  const serialized = initialState(lines);
  const [, entry] = pathEntryForFile({
    relPath: params.relPath,
    textCanonical: normalizeLf(body),
    serializedWeave: serialized,
    weaveFormatVersion: params.weaveFormatVersion,
    diffEngineId: params.diffEngineId,
    parentWeaveShas: params.parentWeaveShas,
    degraded: true,
  });
  return { entry, serialized };
}

export function persistCompareThreeWeaveWriteback(params: {
  repoRoot: string;
  manifest: TonicGitManifest;
  pathUpdates: Record<string, PathManifestEntry>;
  serializedByPath: Record<string, string>;
  headCommit: string;
}): void {
  const weaveRoot = path.join(params.repoRoot, ".tonic", "weave");
  const manPath = path.join(weaveRoot, "manifest.json");
  const next: TonicGitManifest = {
    ...params.manifest,
    commit: params.headCommit,
    paths: { ...params.manifest.paths, ...params.pathUpdates },
  };
  for (const ser of Object.values(params.serializedByPath)) {
    persistCheckpointWeaveBlob(weaveRoot, ser);
  }
  fs.mkdirSync(weaveRoot, { recursive: true });
  fs.writeFileSync(manPath, serializeManifestJson(next), "utf8");
}
