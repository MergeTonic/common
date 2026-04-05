import * as fs from "node:fs";
import * as path from "node:path";
import { currentLines } from "../core";
import { deserializeState, serializeState } from "../state";
import type { TonicGitManifest } from "./types";
import { normalizeLf, sha256HexBytes, sha256HexUtf8 } from "./hashutil";
import { parseManifestJson } from "./manifest";
import { gitStagedPaths } from "./gitStaging";
import { findLfsPointersUnder } from "./lfs";

export const DEFAULT_WEAVE_ROOT = path.join(".tonic", "weave");

export type VerifyCheck = { id: string; ok: boolean; message: string; path?: string };
export type VerifyError = { code: string; message: string; path?: string };

export type VerifyResult = {
  ok: boolean;
  status: string;
  strict: boolean;
  errors: VerifyError[];
  checks: VerifyCheck[];
};

/** Match ``VerifyResult.report_dict`` status logic in Python ``verify.py``. */
export function verifyReportStatus(ok: boolean, strict: boolean, errorCount: number): "ok" | "failed" | "degraded" {
  if (ok) {
    return "ok";
  }
  if (strict || errorCount === 0) {
    return "failed";
  }
  return "degraded";
}

export function verifyReportDict(repoRoot: string, vr: VerifyResult): Record<string, unknown> {
  return {
    schema: "tonic-weave-verify-report",
    version: "1",
    status: verifyReportStatus(vr.ok, vr.strict, vr.errors.length),
    strict: vr.strict,
    repo_root: path.resolve(repoRoot),
    checks: vr.checks,
    errors: vr.errors,
  };
}

export function weaveBlobPath(weaveRoot: string, weaveSerializedSha: string): string {
  return path.join(weaveRoot, "blobs", weaveSerializedSha);
}

export function verifyPathLocal(
  repoRoot: string,
  relPath: string,
  entry: Record<string, unknown>,
  weaveRoot: string,
): string[] {
  const errs: string[] = [];
  const p = path.join(repoRoot, relPath);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
    errs.push(`${relPath}: missing file`);
    return errs;
  }
  const raw = fs.readFileSync(p, "utf8");
  const norm = normalizeLf(raw);
  const lines = norm.length ? norm.split("\n") : [];
  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const textSha = sha256HexUtf8(norm);
  const wantText = entry.text_blob_sha;
  if (typeof wantText !== "string" || textSha !== wantText) {
    errs.push(`${relPath}: text_blob_sha mismatch (got ${textSha})`);
  }
  const wss = entry.weave_serialized_sha;
  if (typeof wss !== "string") {
    errs.push(`${relPath}: invalid weave_serialized_sha in manifest`);
    return errs;
  }
  const blob = weaveBlobPath(weaveRoot, wss);
  if (!fs.existsSync(blob)) {
    errs.push(`${relPath}: missing weave blob at ${blob}`);
    return errs;
  }
  const weaveBytes = fs.readFileSync(blob);
  if (sha256HexBytes(weaveBytes) !== wss) {
    errs.push(`${relPath}: weave blob hash mismatch`);
    return errs;
  }
  let stateS: string;
  try {
    stateS = weaveBytes.toString("utf8");
    deserializeState(stateS);
  } catch (e) {
    errs.push(`${relPath}: deserialize_state failed: ${e}`);
    return errs;
  }
  const roundtrip = Buffer.from(serializeState(deserializeState(stateS)), "utf8");
  if (sha256HexBytes(roundtrip) !== wss) {
    errs.push(`${relPath}: weave round-trip sha mismatch`);
  }
  let cl: string[];
  try {
    cl = currentLines(stateS);
  } catch (e) {
    errs.push(`${relPath}: current_lines failed: ${e}`);
    return errs;
  }
  if (cl.join("\n") !== lines.join("\n")) {
    errs.push(`${relPath}: working tree text does not match weave current_lines`);
  }
  return errs;
}

export function verifyManifest(
  repoRoot: string,
  manifest: TonicGitManifest,
  options: { weaveRoot?: string; onlyPaths?: Set<string> | null; strict?: boolean } = {},
): VerifyResult {
  const wr = options.weaveRoot ?? path.join(repoRoot, DEFAULT_WEAVE_ROOT);
  const checks: VerifyCheck[] = [];
  const errors: VerifyError[] = [];
  const strict = options.strict ?? false;
  const only = options.onlyPaths ?? null;
  const paths = manifest.paths;
  for (const [rel, ent] of Object.entries(paths)) {
    if (only !== null && !only.has(rel)) {
      continue;
    }
    if (typeof ent !== "object" || ent === null) {
      errors.push({ code: "bad_entry", message: `${rel}: not an object`, path: rel });
      continue;
    }
    const pe = verifyPathLocal(repoRoot, rel, ent as Record<string, unknown>, wr);
    const ok = pe.length === 0;
    checks.push({ id: `path:${rel}`, ok, message: pe.join("; ") || "", path: rel });
    for (const m of pe) {
      errors.push({ code: "verify_path", message: m, path: rel });
    }
  }
  if (strict) {
    for (const [rel, ent] of Object.entries(paths)) {
      if (only !== null && !only.has(rel)) {
        continue;
      }
      if (typeof ent === "object" && ent !== null && (ent as { degraded?: boolean }).degraded === true) {
        const msg = `${rel}: degraded manifest row not allowed in strict mode`;
        errors.push({ code: "strict_degraded", message: msg, path: rel });
        checks.push({ id: `strict:${rel}`, ok: false, message: msg, path: rel });
      }
    }
  }
  const ok = errors.length === 0;
  const status = verifyReportStatus(ok, strict, errors.length);
  return { ok, status, strict, errors, checks };
}

/** Append LFS pointer errors like Python ``cmd_weave_verify`` when strict or ``--check-lfs``. */
export function applyLfsPointerChecks(
  vr: VerifyResult,
  repoRoot: string,
  opts: { checkLfs: boolean },
): VerifyResult {
  if (!opts.checkLfs && !vr.strict) {
    return vr;
  }
  const objs = path.join(repoRoot, ".tonic", "objects");
  const pointers = findLfsPointersUnder(objs);
  if (!pointers.length) {
    return vr;
  }
  const errors = [...vr.errors];
  const checks = [...vr.checks];
  for (const p of pointers) {
    errors.push({ code: "lfs_pointer", message: `LFS pointer not smudged: ${p}`, path: p });
    checks.push({ id: `lfs:${p}`, ok: false, message: "pointer present", path: p });
  }
  const ok = false;
  const status = verifyReportStatus(ok, vr.strict, errors.length);
  return { ok, status, strict: vr.strict, errors, checks };
}

export function verifyStaged(
  repoRoot: string,
  manifestJson: string,
  options: { weaveRoot?: string; strict?: boolean } = {},
): VerifyResult {
  const manifest = parseManifestJson(manifestJson);
  const staged = gitStagedPaths(repoRoot);
  let onlyPaths: Set<string> | null = null;
  if (staged.size === 0) {
    onlyPaths = null;
  } else {
    const manifestPaths = new Set(Object.keys(manifest.paths));
    const inter = new Set([...manifestPaths].filter((k) => staged.has(k)));
    if (inter.size === 0) {
      const strict = options.strict ?? false;
      return {
        ok: true,
        status: "ok",
        strict,
        checks: [{ id: "staged", ok: true, message: "no staged tonic paths in manifest" }],
        errors: [],
      };
    }
    onlyPaths = inter;
  }
  return verifyManifest(repoRoot, manifest, { ...options, onlyPaths });
}

export function verifyReportJson(repoRoot: string, manifestJson: string, opts?: object): string {
  const m = parseManifestJson(manifestJson);
  const vr = verifyManifest(repoRoot, m, opts as { weaveRoot?: string; onlyPaths?: Set<string> | null; strict?: boolean });
  return JSON.stringify(verifyReportDict(repoRoot, vr), null, 2);
}
