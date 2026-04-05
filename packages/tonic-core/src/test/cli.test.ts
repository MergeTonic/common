import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const fixDir = path.join(repoRoot, "merge-tonic-lib", "tests", "fixtures", "cli");
/** Resolves when tests run from dist/test (npm run build). */
const astGrepFixDir = path.join(__dirname, "..", "..", "src", "test", "fixtures", "astGrep");
const cliJs = path.join(__dirname, "..", "cli.js");

function runCli(args: string[], env?: NodeJS.ProcessEnv): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [cliJs, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: env ?? { ...process.env, MERGETONIC_LICENSE_ACCEPTED: "1" },
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

test("merge subcommand emits Tonic markers", () => {
  const left = path.join(fixDir, "left.txt");
  const right = path.join(fixDir, "right.txt");
  const { status, stdout } = runCli(["merge", "--left", left, "--right", right]);
  assert.equal(status, 0);
  assert.match(stdout, /<<<<<<< begin/);
  assert.match(stdout, />>>>>>> end conflict/);
});

test("merge supports short flags", () => {
  const left = path.join(fixDir, "left.txt");
  const right = path.join(fixDir, "right.txt");
  const { status, stdout } = runCli(["m", "-l", left, "-r", right]);
  assert.equal(status, 0);
  assert.match(stdout, /<<<<<<< begin/);
});

test("report supports positional files without markers", () => {
  const left = path.join(fixDir, "left.txt");
  const right = path.join(fixDir, "right.txt");
  const { status, stdout } = runCli(["r", left, right, "-p", "demo.txt"]);
  assert.equal(status, 0);
  const data = JSON.parse(stdout) as { schema: string };
  assert.equal(data.schema, "merge-tonic-report");
});

test("merge-tonic legacy first argv is ignored", () => {
  const left = path.join(fixDir, "left.txt");
  const right = path.join(fixDir, "right.txt");
  const { status, stdout } = runCli(["merge-tonic", "merge", "--left", left, "--right", right]);
  assert.equal(status, 0);
  assert.match(stdout, /<<<<<<< begin/);
});

test("report subcommand emits schema merge-tonic-report", () => {
  const left = path.join(fixDir, "left.txt");
  const right = path.join(fixDir, "right.txt");
  const { status, stdout } = runCli([
    "report",
    "--left",
    left,
    "--right",
    right,
    "--path",
    "demo.txt",
  ]);
  assert.equal(status, 0);
  const data = JSON.parse(stdout) as { schema: string; files: unknown[] };
  assert.equal(data.schema, "merge-tonic-report");
  assert.equal(data.files.length, 1);
});

test("report emits optional blame metadata when enabled", () => {
  const left = path.join(fixDir, "left.txt");
  const right = path.join(fixDir, "right.txt");
  const { status, stdout } = runCli([
    "report",
    "--left",
    left,
    "--right",
    right,
    "--path",
    "demo.txt",
    "--blame",
    "--left-commit-id",
    "abc123",
    "--right-commit-id",
    "def456",
  ]);
  assert.equal(status, 0);
  const data = JSON.parse(stdout) as {
    files: Array<{
      left_commit_id?: string;
      right_commit_id?: string;
      conflict_regions: Array<{ left_commit_ids?: string[]; right_commit_ids?: string[] }>;
    }>;
  };
  const f0 = data.files[0]!;
  assert.equal(f0.left_commit_id, "abc123");
  assert.equal(f0.right_commit_id, "def456");
  if (f0.conflict_regions.length > 0) {
    assert.deepEqual(f0.conflict_regions[0]!.left_commit_ids, ["abc123"]);
    assert.deepEqual(f0.conflict_regions[0]!.right_commit_ids, ["def456"]);
  }
});

test("conflicts subcommand parses file", () => {
  const left = path.join(fixDir, "left.txt");
  const { status, stdout } = runCli(["conflicts", "--file", left]);
  assert.equal(status, 0);
  const data = JSON.parse(stdout) as { blocks: unknown[]; warnings: unknown[] };
  assert.deepEqual(data.blocks, []);
  assert.deepEqual(data.warnings, []);
});

test("apply subcommand returns clean_lines JSON", () => {
  const left = path.join(fixDir, "left.txt");
  const right = path.join(fixDir, "right.txt");
  const { stdout: markerText } = runCli(["merge", "--left", left, "--right", right]);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-apply-"));
  const markerPath = path.join(tmpDir, "m.txt");
  try {
    fs.writeFileSync(markerPath, markerText, "utf8");
    const { status, stdout } = runCli(["apply", "--file", markerPath]);
    assert.equal(status, 0);
    const data = JSON.parse(stdout) as { clean_lines: string[]; region_count: number };
    assert.ok(Array.isArray(data.clean_lines));
    assert.ok(!data.clean_lines.some((l) => l.startsWith("<<<<<<<")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("apply accepts positional file without --file", () => {
  const left = path.join(fixDir, "left.txt");
  const right = path.join(fixDir, "right.txt");
  const { stdout: markerText } = runCli(["merge", "-l", left, "-r", right]);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-apply-pos-"));
  const markerPath = path.join(tmpDir, "m.txt");
  try {
    fs.writeFileSync(markerPath, markerText, "utf8");
    const { status, stdout } = runCli(["a", markerPath]);
    assert.equal(status, 0);
    const data = JSON.parse(stdout) as { clean_lines: string[] };
    assert.ok(Array.isArray(data.clean_lines));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

function git(repo: string, args: string[]): { status: number | null } {
  return spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
}

test("git materialize --write after merge conflict", () => {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["git"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (which.status !== 0) {
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-cli-gm-"));
  try {
    assert.equal(git(tmp, ["init"]).status, 0);
    assert.equal(git(tmp, ["config", "user.email", "t@e.st"]).status, 0);
    assert.equal(git(tmp, ["config", "user.name", "t"]).status, 0);
    assert.equal(git(tmp, ["branch", "-M", "main"]).status, 0);
    fs.writeFileSync(path.join(tmp, "foo.txt"), "A\n", "utf8");
    assert.equal(git(tmp, ["add", "foo.txt"]).status, 0);
    assert.equal(git(tmp, ["commit", "-m", "base"]).status, 0);
    assert.equal(git(tmp, ["checkout", "-b", "other"]).status, 0);
    fs.writeFileSync(path.join(tmp, "foo.txt"), "B\n", "utf8");
    assert.equal(git(tmp, ["add", "foo.txt"]).status, 0);
    assert.equal(git(tmp, ["commit", "-m", "other"]).status, 0);
    assert.equal(git(tmp, ["checkout", "main"]).status, 0);
    fs.writeFileSync(path.join(tmp, "foo.txt"), "C\n", "utf8");
    assert.equal(git(tmp, ["add", "foo.txt"]).status, 0);
    assert.equal(git(tmp, ["commit", "-m", "main"]).status, 0);
    const m = git(tmp, ["merge", "other"]);
    assert.notEqual(m.status, 0);
    const cli = runCli(["git", "--repo", tmp, "materialize", "--write"]);
    assert.equal(cli.status, 0, cli.stderr);
    const text = fs.readFileSync(path.join(tmp, "foo.txt"), "utf8");
    assert.match(text, /<<<<<<< begin/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("ast-grep-hydrate CLI writes tonic-ast-hydration with fake sg", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-cli-agh-"));
  fs.writeFileSync(path.join(dir, "sample.ts"), "// x\n", "utf8");
  const fake = path.resolve(astGrepFixDir, "fake-sg-success.js");
  const out = path.join(dir, "ast.json");
  const runOut = path.join(dir, "run.json");
  const { status } = runCli([
    "ast-grep-hydrate",
    "--repo",
    dir,
    "--out",
    out,
    "--run-out",
    runOut,
    "--ast-grep-bin",
    fake,
  ]);
  assert.equal(status, 0);
  const ast = JSON.parse(fs.readFileSync(out, "utf8")) as { schema: string };
  assert.equal(ast.schema, "tonic-ast-hydration");
  const run = JSON.parse(fs.readFileSync(runOut, "utf8")) as { exit_code: number };
  assert.equal(run.exit_code, 0);
});

test("ast-grep-hydrate CLI returns 10 when binary missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-cli-agh-miss-"));
  const bogus = path.join(dir, "no-sg-here.exe");
  const out = path.join(dir, "ast.json");
  const runOut = path.join(dir, "run.json");
  const { status } = runCli([
    "agh",
    "--repo",
    dir,
    "--out",
    out,
    "--run-out",
    runOut,
    "--ast-grep-bin",
    bogus,
  ]);
  assert.equal(status, 10);
  const run = JSON.parse(fs.readFileSync(runOut, "utf8")) as { exit_code: number; status: string };
  assert.equal(run.exit_code, 10);
  assert.equal(run.status, "failed");
});

test("hydrate CLI writes intent bootstrap and intent-hydration with fake sg", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-cli-hyd-"));
  fs.writeFileSync(path.join(dir, "sample.ts"), "// y\n", "utf8");
  const fake = path.resolve(astGrepFixDir, "fake-sg-success.js");
  const outDir = path.join(dir, "out");
  const { status } = runCli([
    "hydrate",
    "--repo",
    dir,
    "--out-dir",
    outDir,
    "--left-intent",
    "merge A",
    "--right-intent",
    "merge B",
    "--question-mode",
    "off",
    "--ast-grep-bin",
    fake,
  ]);
  assert.ok(status === 0 || status === 13, `expected 0 or partial 13, got ${status}`);
  const bootPath = path.join(outDir, "intent-bootstrap.json");
  const intentPath = path.join(outDir, "intent-hydration.json");
  assert.ok(fs.existsSync(bootPath));
  assert.ok(fs.existsSync(intentPath));
  const boot = JSON.parse(fs.readFileSync(bootPath, "utf8")) as {
    left_intent: string;
    right_intent: string;
  };
  assert.equal(boot.left_intent, "merge A");
  assert.equal(boot.right_intent, "merge B");
  const ih = JSON.parse(fs.readFileSync(intentPath, "utf8")) as { schema: string };
  assert.equal(ih.schema, "tonic-intent-hydration");
});

test("hydrate CLI unknown --phase exits 11", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-cli-hyd-phase-"));
  const outDir = path.join(dir, "out");
  const { status, stderr } = runCli([
    "hydrate",
    "--repo",
    dir,
    "--out-dir",
    outDir,
    "--phase",
    "not-a-real-phase",
    "--left-intent",
    "a",
    "--right-intent",
    "b",
  ]);
  assert.equal(status, 11);
  assert.match(stderr, /--phase|unknown/i);
});

test("hydrate --phase intent-bootstrap skips downstream stages", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-cli-hyd-phase-boot-"));
  const outDir = path.join(dir, "out");
  const { status } = runCli([
    "hydrate",
    "--repo",
    dir,
    "--out-dir",
    outDir,
    "--phase",
    "intent-bootstrap",
    "--left-intent",
    "a",
    "--right-intent",
    "b",
    "--question-mode",
    "off",
  ]);
  assert.equal(status, 0);
  const run = JSON.parse(fs.readFileSync(path.join(outDir, "hydration-run.json"), "utf8")) as {
    pipeline?: { stages: Array<{ id: string; status: string }> };
  };
  const stages = run.pipeline?.stages ?? [];
  assert.ok(stages.some((s) => s.id === "conflicts" && (s.status === "ok" || s.status === "skipped")));
  assert.ok(stages.some((s) => s.id === "intent_bootstrap" && s.status === "ok"));
  assert.ok(stages.some((s) => s.id === "question_refinement" && s.status === "skipped"));
});

test("hydrate with improver and no API key exits partial with warning", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-cli-hyd-llm-"));
  fs.writeFileSync(path.join(dir, "sample.ts"), "// y\n", "utf8");
  const fake = path.resolve(astGrepFixDir, "fake-sg-success.js");
  const outDir = path.join(dir, "out");
  const env: NodeJS.ProcessEnv = { ...process.env, MERGETONIC_LICENSE_ACCEPTED: "1" };
  delete env.OPENAI_API_KEY;
  const { status, stderr } = runCli(
    [
      "hydrate",
      "--repo",
      dir,
      "--out-dir",
      outDir,
      "--left-intent",
      "a",
      "--right-intent",
      "b",
      "--question-mode",
      "improver",
      "--openai-api-key-env",
      "OPENAI_API_KEY",
      "--ast-grep-bin",
      fake,
    ],
    env,
  );
  assert.equal(status, 13, stderr);
  const run = JSON.parse(fs.readFileSync(path.join(outDir, "hydration-run.json"), "utf8")) as {
    warnings: Array<{ code?: string; message?: string }>;
  };
  assert.ok(run.warnings.some((w) => /missing|skipped|OPENAI/i.test(w.message ?? "")));
});

test("hydrate with improver and strict-llm fails when API key missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-cli-hyd-strict-"));
  fs.writeFileSync(path.join(dir, "sample.ts"), "// y\n", "utf8");
  const fake = path.resolve(astGrepFixDir, "fake-sg-success.js");
  const outDir = path.join(dir, "out2");
  const env: NodeJS.ProcessEnv = { ...process.env, MERGETONIC_LICENSE_ACCEPTED: "1" };
  delete env.OPENAI_API_KEY;
  const { status } = runCli(
    [
      "hydrate",
      "--repo",
      dir,
      "--out-dir",
      outDir,
      "--left-intent",
      "a",
      "--right-intent",
      "b",
      "--question-mode",
      "improver",
      "--strict-llm",
      "--openai-api-key-env",
      "OPENAI_API_KEY",
      "--ast-grep-bin",
      fake,
    ],
    env,
  );
  assert.equal(status, 11);
});

test("merge positional branch helper writes markers on target branch", () => {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["git"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (which.status !== 0) {
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-cli-branch-"));
  try {
    assert.equal(git(tmp, ["init"]).status, 0);
    assert.equal(git(tmp, ["config", "user.email", "t@e.st"]).status, 0);
    assert.equal(git(tmp, ["config", "user.name", "t"]).status, 0);
    assert.equal(git(tmp, ["branch", "-M", "main"]).status, 0);
    fs.writeFileSync(path.join(tmp, "foo.txt"), "A\n", "utf8");
    assert.equal(git(tmp, ["add", "foo.txt"]).status, 0);
    assert.equal(git(tmp, ["commit", "-m", "base"]).status, 0);

    assert.equal(git(tmp, ["checkout", "-b", "dev"]).status, 0);
    fs.writeFileSync(path.join(tmp, "foo.txt"), "C\n", "utf8");
    assert.equal(git(tmp, ["add", "foo.txt"]).status, 0);
    assert.equal(git(tmp, ["commit", "-m", "dev"]).status, 0);

    assert.equal(git(tmp, ["checkout", "main"]).status, 0);
    fs.writeFileSync(path.join(tmp, "foo.txt"), "B\n", "utf8");
    assert.equal(git(tmp, ["add", "foo.txt"]).status, 0);
    assert.equal(git(tmp, ["commit", "-m", "main"]).status, 0);
    assert.equal(git(tmp, ["checkout", "dev"]).status, 0);

    const cli = runCli(["merge", "main", "dev", "--repo", tmp]);
    assert.equal(cli.status, 0, cli.stderr);
    const text = fs.readFileSync(path.join(tmp, "foo.txt"), "utf8");
    assert.match(text, /<<<<<<< begin/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

function isolatedNoLicenseEnv(tmp: string): NodeJS.ProcessEnv {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  delete env.MERGETONIC_LICENSE_ACCEPTED;
  env.HOME = tmp;
  env.USERPROFILE = tmp;
  if (process.platform === "win32") {
    env.APPDATA = path.join(tmp, "Roaming");
  } else {
    env.XDG_CONFIG_HOME = path.join(tmp, ".config");
  }
  return env;
}

test("merge is blocked without license acceptance", () => {
  const left = path.join(fixDir, "left.txt");
  const right = path.join(fixDir, "right.txt");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-lic-"));
  try {
    const { status, stderr } = runCli(["merge", "--left", left, "--right", right], isolatedNoLicenseEnv(tmp));
    assert.notEqual(status, 0);
    assert.match(stderr.toLowerCase(), /accept-license/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("--help works without license", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-lic-h-"));
  try {
    const { status, stderr } = runCli(["--help"], isolatedNoLicenseEnv(tmp));
    assert.equal(status, 0);
    assert.match(stderr, /merge-tonic/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("accept-license then merge succeeds", () => {
  const left = path.join(fixDir, "left.txt");
  const right = path.join(fixDir, "right.txt");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-lic-acc-"));
  try {
    const env = isolatedNoLicenseEnv(tmp);
    const acc = runCli(["accept-license"], env);
    assert.equal(acc.status, 0, acc.stderr);
    const { status, stdout } = runCli(["merge", "--left", left, "--right", right], env);
    assert.equal(status, 0);
    assert.match(stdout, /<<<<<<< begin/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
