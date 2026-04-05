import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import type { AstGrepCliOptions } from "./types";

function tryWhich(cmd: string): string | null {
  const isWin = process.platform === "win32";
  const which = isWin ? "where" : "which";
  const r = spawnSync(which, [cmd], { encoding: "utf8", shell: isWin });
  if (r.status !== 0 || !r.stdout) {
    return null;
  }
  const line = r.stdout.split(/\r?\n/).find((l) => l.trim().length > 0);
  return line?.trim() || null;
}

/**
 * Resolve ast-grep binary: flag -> TONIC_AST_GREP_BIN -> sg -> ast-grep.
 */
export function resolveAstGrepBinary(opts: Pick<AstGrepCliOptions, "astGrepBin">): string | null {
  const fromFlag = opts.astGrepBin.trim();
  if (fromFlag) {
    const looksLikePath =
      fromFlag.includes("/") ||
      fromFlag.includes("\\") ||
      fromFlag.endsWith(".js") ||
      fromFlag.endsWith(".exe") ||
      path.isAbsolute(fromFlag);
    if (looksLikePath && !fs.existsSync(fromFlag)) {
      return null;
    }
    if (fs.existsSync(fromFlag) || fromFlag.includes("/") || fromFlag.includes("\\")) {
      return fromFlag;
    }
    const w = tryWhich(fromFlag);
    if (w) {
      return w;
    }
    return fromFlag;
  }
  const env = (process.env.TONIC_AST_GREP_BIN ?? "").trim();
  if (env) {
    return env;
  }
  const sg = tryWhich("sg");
  if (sg) {
    return sg;
  }
  const ag = tryWhich("ast-grep");
  return ag;
}

export function readAstGrepVersion(bin: string): string {
  if (bin.endsWith(".js")) {
    return "fixture-js";
  }
  const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 10_000 });
  if (r.status !== 0) {
    return "unknown";
  }
  return (r.stdout || r.stderr || "").split(/\r?\n/)[0]?.trim() || "unknown";
}
