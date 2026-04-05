"use strict";

/**
 * Run esbuild from the workspace-resolved install (hoist-safe) without .bin shims.
 * Uses `node .../esbuild/bin/esbuild` so Windows works with hoisted node_modules.
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const cwd = process.cwd();
let esbuildPkgRoot;
try {
  esbuildPkgRoot = path.dirname(
    require.resolve("esbuild/package.json", { paths: [cwd] }),
  );
} catch {
  console.error(
    "[run-esbuild] Could not resolve esbuild from cwd=%s; run npm install in this workspace.",
    cwd,
  );
  process.exit(1);
}

const cli = path.join(esbuildPkgRoot, "bin", "esbuild");
const args = process.argv.slice(2);
const r = spawnSync(process.execPath, [cli, ...args], {
  stdio: "inherit",
  windowsHide: true,
  cwd,
});
process.exit(r.status === null ? 1 : r.status);
