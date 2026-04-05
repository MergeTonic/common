"use strict";

/**
 * Run the repo-root TypeScript compiler without relying on `node_modules/.bin/tsc`
 * (Windows symlink/Developer Mode issues can leave .bin shims empty or unusable).
 *
 * npm sets INIT_CWD to the package directory for lifecycle scripts.
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const tscJs = path.join(root, "node_modules", "typescript", "lib", "tsc.js");
const args = process.argv.slice(2);

// Do not override cwd: for `npm run -w`, npm cds into the workspace before spawning the script.
// `npm_package_json` often refers to the *root* package during workspace runs, which would break `-p .`.
const r = spawnSync(process.execPath, [tscJs, ...args], { stdio: "inherit" });
process.exit(r.status === null ? 1 : r.status);
