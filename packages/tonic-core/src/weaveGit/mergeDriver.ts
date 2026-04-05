/**
 * Keep in sync with `merge-tonic-lib/tonic/weave_git/merge_driver.py` — run Python + TS tests when editing.
 */

import * as fs from "node:fs";

import { currentLines, initialState, mergeStates } from "../core";
import { canonicalTextLines, normalizeLf, sha256HexBytes } from "./hashutil";
import { pathEntryForFile } from "./manifest";
import { stateHash } from "./replay";
import type { PathManifestEntry } from "./types";
import { weaveBlobPath } from "./verify";

export type MergeDriverResult = {
  exitCode: number;
  mergedText: string;
  manifestEntry: PathManifestEntry | null;
  stderr: string[];
  serializedWeave: string | null;
};

export type LoadStateFn = () => string | null;

export function mergeDriverExitCodeForAnnotated(annotatedLines: string[]): number {
  return annotatedLines.some((line) => line.includes("<<<<<<<")) ? 1 : 0;
}

export function mergeDriverCompatibilityErrors(params: {
  textBase: string;
  textOurs: string;
  textTheirs: string;
  sBase: string;
  sOurs: string;
  sTheirs: string;
  weaveFormatVersion: string;
  diffEngineId: string;
  manifestEntryBase?: PathManifestEntry | null;
  manifestEntryOurs?: PathManifestEntry | null;
  manifestEntryTheirs?: PathManifestEntry | null;
}): string[] {
  const errs: string[] = [];
  const triple: [string, string, string][] = [
    ["base", params.textBase, params.sBase],
    ["ours", params.textOurs, params.sOurs],
    ["theirs", params.textTheirs, params.sTheirs],
  ];
  for (const [label, text, state] of triple) {
    try {
      const wantLines = canonicalTextLines(text);
      const gotLines = currentLines(state);
      if (gotLines.length !== wantLines.length || gotLines.some((g, i) => g !== wantLines[i])) {
        errs.push(
          `${label}: weave current_lines do not match Git text (replay/text mismatch); ` +
            `refuse merge_states without aligned artifacts`,
        );
      }
    } catch (e) {
      errs.push(`${label}: current_lines failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const entries = [params.manifestEntryBase, params.manifestEntryOurs, params.manifestEntryTheirs];
  if (entries.some((e) => e != null)) {
    for (const [label, state, entry] of [
      ["base", params.sBase, params.manifestEntryBase],
      ["ours", params.sOurs, params.manifestEntryOurs],
      ["theirs", params.sTheirs, params.manifestEntryTheirs],
    ] as const) {
      if (!entry) {
        continue;
      }
      const wss = entry.weave_serialized_sha;
      if (typeof wss === "string" && wss && stateHash(state) !== wss) {
        errs.push(`${label}: manifest weave_serialized_sha does not match loaded state`);
      }
      const ve = entry.weave_format_version;
      const de = entry.diff_engine_id;
      if (typeof ve === "string" && ve && ve !== params.weaveFormatVersion) {
        errs.push(
          `${label}: weave_format_version mismatch (manifest ${JSON.stringify(ve)} vs driver ${JSON.stringify(params.weaveFormatVersion)})`,
        );
      }
      if (typeof de === "string" && de && de !== params.diffEngineId) {
        errs.push(
          `${label}: diff_engine_id mismatch (manifest ${JSON.stringify(de)} vs driver ${JSON.stringify(params.diffEngineId)})`,
        );
      }
    }

    const po = params.manifestEntryOurs?.parent_weave_shas;
    const pt = params.manifestEntryTheirs?.parent_weave_shas;
    if (Array.isArray(po) && Array.isArray(pt) && po.length > 0 && pt.length > 0) {
      const bsha = stateHash(params.sBase);
      if (!po.includes(bsha)) {
        errs.push("ours: parent_weave_shas does not include merge-base weave_serialized_sha");
      }
      if (!pt.includes(bsha)) {
        errs.push("theirs: parent_weave_shas does not include merge-base weave_serialized_sha");
      }
    }
  }

  return errs;
}

export function runOptionAMerge(params: {
  textBase: string;
  textOurs: string;
  textTheirs: string;
  loadStateOurs: LoadStateFn;
  loadStateTheirs: LoadStateFn;
  loadStateBase: LoadStateFn;
  weaveFormatVersion: string;
  diffEngineId: string;
  strict?: boolean;
  manifestEntryBase?: PathManifestEntry | null;
  manifestEntryOurs?: PathManifestEntry | null;
  manifestEntryTheirs?: PathManifestEntry | null;
}): MergeDriverResult {
  const strict = params.strict !== false;
  const stderr: string[] = [];
  const sOurs = params.loadStateOurs();
  const sTheirs = params.loadStateTheirs();
  const sBase = params.loadStateBase();
  if (sOurs === null || sTheirs === null) {
    stderr.push("missing ours/theirs weave state");
    return { exitCode: 1, mergedText: "", manifestEntry: null, stderr, serializedWeave: null };
  }
  if (sBase === null) {
    const msg =
      "TONIC_WEAVE_DEGRADED: merge-base weave missing; snapshot merge only. " +
      "Strict repos should reject this commit.";
    stderr.push(msg);
    if (strict) {
      return { exitCode: 1, mergedText: "", manifestEntry: null, stderr, serializedWeave: null };
    }
    const left = normalizeLf(params.textOurs).split("\n");
    const right = normalizeLf(params.textTheirs).split("\n");
    if (left.length && left[left.length - 1] === "") {
      left.pop();
    }
    if (right.length && right[right.length - 1] === "") {
      right.pop();
    }
    const [mergedState, ann] = mergeStates(initialState(left), initialState(right));
    const text = ann.join("\n") + (ann.length ? "\n" : "");
    const [, entry] = pathEntryForFile({
      relPath: ".",
      textCanonical: text,
      serializedWeave: mergedState,
      weaveFormatVersion: params.weaveFormatVersion,
      diffEngineId: params.diffEngineId,
      degraded: true,
    });
    return {
      exitCode: mergeDriverExitCodeForAnnotated(ann),
      mergedText: text,
      manifestEntry: entry,
      stderr,
      serializedWeave: mergedState,
    };
  }

  const compat = mergeDriverCompatibilityErrors({
    textBase: params.textBase,
    textOurs: params.textOurs,
    textTheirs: params.textTheirs,
    sBase,
    sOurs,
    sTheirs,
    weaveFormatVersion: params.weaveFormatVersion,
    diffEngineId: params.diffEngineId,
    manifestEntryBase: params.manifestEntryBase,
    manifestEntryOurs: params.manifestEntryOurs,
    manifestEntryTheirs: params.manifestEntryTheirs,
  });
  for (const line of compat) {
    stderr.push(line);
  }
  if (compat.length > 0) {
    stderr.push("TONIC_WEAVE_MERGE_INCOMPAT: replay/manifest compatibility check failed");
    if (strict) {
      return { exitCode: 1, mergedText: "", manifestEntry: null, stderr, serializedWeave: null };
    }
    const left = normalizeLf(params.textOurs).split("\n");
    const right = normalizeLf(params.textTheirs).split("\n");
    if (left.length && left[left.length - 1] === "") {
      left.pop();
    }
    if (right.length && right[right.length - 1] === "") {
      right.pop();
    }
    const [mergedState, ann] = mergeStates(initialState(left), initialState(right));
    const text = ann.join("\n") + (ann.length ? "\n" : "");
    const [, entry] = pathEntryForFile({
      relPath: ".",
      textCanonical: text,
      serializedWeave: mergedState,
      weaveFormatVersion: params.weaveFormatVersion,
      diffEngineId: params.diffEngineId,
      degraded: true,
    });
    return {
      exitCode: mergeDriverExitCodeForAnnotated(ann),
      mergedText: text,
      manifestEntry: entry,
      stderr,
      serializedWeave: mergedState,
    };
  }

  try {
    const [mergedState, annotated] = mergeStates(sOurs, sTheirs);
    const linesOut = annotated;
    const text = linesOut.join("\n") + (linesOut.length ? "\n" : "");
    const [, entry] = pathEntryForFile({
      relPath: ".",
      textCanonical: text,
      serializedWeave: mergedState,
      weaveFormatVersion: params.weaveFormatVersion,
      diffEngineId: params.diffEngineId,
      degraded: false,
    });
    return {
      exitCode: mergeDriverExitCodeForAnnotated(linesOut),
      mergedText: text,
      manifestEntry: entry,
      stderr,
      serializedWeave: mergedState,
    };
  } catch (e) {
    stderr.push(`merge_states failed: ${e instanceof Error ? e.message : String(e)}`);
    return { exitCode: 1, mergedText: "", manifestEntry: null, stderr, serializedWeave: null };
  }
}

export function loadStateFromWeaveRoot(weaveRoot: string, weaveSerializedSha: string): string | null {
  const p = weaveBlobPath(weaveRoot, weaveSerializedSha);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
    return null;
  }
  const data = fs.readFileSync(p);
  if (sha256HexBytes(data) !== weaveSerializedSha) {
    return null;
  }
  return data.toString("utf8");
}
