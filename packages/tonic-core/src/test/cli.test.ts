import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const fixDir = path.join(repoRoot, "merge-tonic-lib", "tests", "fixtures", "cli");
const cliJs = path.join(__dirname, "..", "cli.js");

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [cliJs, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
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
