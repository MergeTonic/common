import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { runAstGrepHydrate } from "../astGrep/command";
import { EXIT_AST_GREP_MISSING, EXIT_OK, EXIT_PARTIAL, EXIT_SCAN_FAILED } from "../astGrep/types";

/** Source fixtures (not emitted to dist); resolve from package root. */
const fixDir = path.join(__dirname, "..", "..", "src", "test", "fixtures", "astGrep");

test("missing ast-grep binary returns exit 10 and failed run", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-agh-"));
  const out = path.join(dir, "ast.json");
  const run = path.join(dir, "run.json");
  const rc = runAstGrepHydrate({
    repoRoot: dir,
    outPath: out,
    runOutPath: run,
    ruleset: "default",
    configPath: "",
    rulePath: "",
    inlineRule: "",
    languages: "auto",
    includeGlobs: [],
    excludeGlobs: [],
    changedOnly: false,
    maxMatchesPerFile: 0,
    maxMatchesPerRule: 0,
    astGrepBin: path.join(dir, "definitely-missing-sg.exe"),
    extraArgs: [],
  });
  assert.equal(rc, EXIT_AST_GREP_MISSING);
  const runJson = JSON.parse(fs.readFileSync(run, "utf8")) as { exit_code: number; status: string };
  assert.equal(runJson.exit_code, EXIT_AST_GREP_MISSING);
  assert.equal(runJson.status, "failed");
});

test("fake sg produces tonic-ast-hydration and ok run", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-agh-"));
  fs.writeFileSync(path.join(dir, "sample.ts"), "// x\n", "utf8");
  const fake = path.resolve(fixDir, "fake-sg-success.js");
  const out = path.join(dir, "ast.json");
  const run = path.join(dir, "run.json");
  const rc = runAstGrepHydrate({
    repoRoot: dir,
    outPath: out,
    runOutPath: run,
    ruleset: "test",
    configPath: "",
    rulePath: path.join(dir, "rule.yml"),
    inlineRule: "",
    languages: "typescript",
    includeGlobs: [],
    excludeGlobs: [],
    changedOnly: false,
    maxMatchesPerFile: 0,
    maxMatchesPerRule: 0,
    astGrepBin: fake,
    extraArgs: [],
  });
  assert.equal(rc, EXIT_OK);
  const ast = JSON.parse(fs.readFileSync(out, "utf8")) as { schema: string; matches: unknown[] };
  assert.equal(ast.schema, "tonic-ast-hydration");
  assert.equal(ast.matches.length, 1);
});

test("fake sg fail exit maps to 12", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-agh-"));
  const fake = path.resolve(fixDir, "fake-sg-fail.js");
  const out = path.join(dir, "ast.json");
  const run = path.join(dir, "run.json");
  const rc = runAstGrepHydrate({
    repoRoot: dir,
    outPath: out,
    runOutPath: run,
    ruleset: "test",
    configPath: "",
    rulePath: path.join(dir, "r.yml"),
    inlineRule: "",
    languages: "auto",
    includeGlobs: [],
    excludeGlobs: [],
    changedOnly: false,
    maxMatchesPerFile: 0,
    maxMatchesPerRule: 0,
    astGrepBin: fake,
    extraArgs: [],
  });
  assert.equal(rc, EXIT_SCAN_FAILED);
});

test("git diff failed warning yields partial exit when scanning", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-agh-"));
  fs.writeFileSync(path.join(dir, "a.ts"), "export const a = 1\n", "utf8");
  const fake = path.resolve(fixDir, "fake-sg-success.js");
  const out = path.join(dir, "ast.json");
  const run = path.join(dir, "run.json");
  const rc = runAstGrepHydrate({
    repoRoot: dir,
    outPath: out,
    runOutPath: run,
    ruleset: "test",
    configPath: "",
    rulePath: path.join(dir, "r.yml"),
    inlineRule: "",
    languages: "auto",
    includeGlobs: [],
    excludeGlobs: [],
    changedOnly: true,
    maxMatchesPerFile: 0,
    maxMatchesPerRule: 0,
    astGrepBin: fake,
    extraArgs: [],
  });
  assert.equal(rc, EXIT_PARTIAL);
  const runJson = JSON.parse(fs.readFileSync(run, "utf8")) as { warnings: { code: string }[] };
  assert.ok(runJson.warnings.some((w) => w.code === "git_diff_failed"));
});
