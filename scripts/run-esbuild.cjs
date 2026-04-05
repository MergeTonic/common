"use strict";

/**
 * Run esbuild from the workspace-resolved install (hoist-safe) without .bin shims.
 * On Linux/macOS, `bin/esbuild` is a native executable (not a JS file); on Windows
 * use `esbuild.exe` or `esbuild.cmd` when present. Do not invoke the binary via `node`.
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
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

function resolveEsbuildCli(pkgRoot) {
  const binDir = path.join(pkgRoot, "bin");
  if (process.platform === "win32") {
    const exe = path.join(binDir, "esbuild.exe");
    if (fs.existsSync(exe)) {
      return exe;
    }
    const cmd = path.join(binDir, "esbuild.cmd");
    if (fs.existsSync(cmd)) {
      return cmd;
    }
  }
  return path.join(binDir, "esbuild");
}

/** First bytes of the esbuild entry: Linux ships a native binary; Windows often ships a node launcher script. */
function peekFileStart(filePath, maxBytes = 160) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(maxBytes);
    const n = fs.readSync(fd, buf, 0, maxBytes, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function shouldRunEsbuildWithNode(cliPath) {
  if (cliPath.endsWith(".cmd")) {
    return false;
  }
  const buf = peekFileStart(cliPath);
  if (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
    return false;
  }
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) {
    return false;
  }
  const head = buf.toString("utf8");
  return /#!.*\bnode\b/.test(head) || /^\s*["']use strict["']/.test(head);
}

const cli = resolveEsbuildCli(esbuildPkgRoot);
const args = process.argv.slice(2);
const useNode = shouldRunEsbuildWithNode(cli);
const shell = process.platform === "win32" && cli.endsWith(".cmd");
const r = useNode
  ? spawnSync(process.execPath, [cli, ...args], {
      stdio: "inherit",
      windowsHide: true,
      cwd,
    })
  : spawnSync(cli, args, {
      stdio: "inherit",
      windowsHide: true,
      cwd,
      shell,
    });
process.exit(r.status === null ? 1 : r.status);
