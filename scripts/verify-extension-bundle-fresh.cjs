"use strict";

/**
 * Rebuild extension bundle and fail if committed extension.js / .map drift.
 * Run from repository root after `npm ci`.
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const compile = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "compile", "-w", "merge-conflict-resolver"],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const diff = spawnSync(
  "git",
  [
    "diff",
    "--exit-code",
    "--",
    "extensions/tonic-conflict-resolver/out/extension.js",
    "extensions/tonic-conflict-resolver/out/extension.js.map",
  ],
  { cwd: root, stdio: "inherit" },
);

if (diff.status !== 0) {
  console.error(
    "[verify-extension-bundle-fresh] extension.js or extension.js.map differs after compile — run `npm run compile -w merge-conflict-resolver` and commit the outputs.",
  );
  process.exit(diff.status ?? 1);
}

require("./verify-extension-bundle.cjs");
