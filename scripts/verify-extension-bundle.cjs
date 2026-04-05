"use strict";

/**
 * Validate committed VS Code extension bundle + sourcemap (structure only).
 * Paths are relative to repository root.
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extJs = path.join(root, "extensions", "tonic-conflict-resolver", "out", "extension.js");
const extMap = path.join(root, "extensions", "tonic-conflict-resolver", "out", "extension.js.map");

function fail(msg) {
  console.error(`[verify-extension-bundle] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(extJs)) {
  fail(`missing ${path.relative(root, extJs)}`);
}
if (!fs.existsSync(extMap)) {
  fail(`missing ${path.relative(root, extMap)}`);
}

const js = fs.readFileSync(extJs, "utf8");
if (!js.includes("//# sourceMappingURL=extension.js.map")) {
  fail("extension.js must end with //# sourceMappingURL=extension.js.map");
}

let map;
try {
  map = JSON.parse(fs.readFileSync(extMap, "utf8"));
} catch (e) {
  fail(`extension.js.map is not valid JSON: ${e.message}`);
}

for (const k of ["version", "sources", "mappings"]) {
  if (map[k] === undefined) {
    fail(`extension.js.map missing top-level key "${k}"`);
  }
}

console.log("[verify-extension-bundle] OK");
