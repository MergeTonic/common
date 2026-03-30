import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const fixDir = path.join(repoRoot, "merge-tonic-lib", "tests", "fixtures", "cli");
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

test("git hydrate-intents --check-optional-ai returns machine-ready ok payload in memory mode", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-hydrate-ai-check-"));
  try {
    const outPath = path.join(tmpDir, "result.json");
    const env = {
      ...process.env,
      MERGETONIC_LICENSE_ACCEPTED: "1",
      TONIC_CHROMA_MODE: "memory",
    };
    const { status, stdout } = runCli(
      ["git", "--repo", repoRoot, "hydrate-intents", "--check-optional-ai", "--out-json", outPath],
      env,
    );
    assert.equal(status, 0, stdout);
    const data = JSON.parse(fs.readFileSync(outPath, "utf8")) as {
      ok: boolean;
      optional_dependency_group: string;
      runtime_mode: string;
      hydration_skipped: boolean;
    };
    assert.equal(data.ok, true);
    assert.equal(data.optional_dependency_group, "ai");
    assert.equal(data.runtime_mode, "memory");
    assert.equal(data.hydration_skipped, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("git hydrate-intents vendoring scaffold writes machine-readable run artifacts", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-hydrate-scaffold-"));
  try {
    const outPath = path.join(tmpDir, "result.json");
    const env = {
      ...process.env,
      MERGETONIC_LICENSE_ACCEPTED: "1",
      TONIC_CHROMA_MODE: "memory",
    };
    const { status } = runCli(
      [
        "git",
        "--repo",
        repoRoot,
        "hydrate-intents",
        "--vendoring-scaffold",
        "--out-json",
        outPath,
      ],
      env,
    );
    assert.equal(status, 0);
    const data = JSON.parse(fs.readFileSync(outPath, "utf8")) as {
      hydration_skipped: boolean;
      skip_reason: string;
      pipeline_run?: { artifacts?: { retrieval_path?: string; llm_transcript_path?: string } };
    };
    assert.equal(data.hydration_skipped, true);
    assert.equal(data.skip_reason, "not_implemented");
    assert.ok(fs.existsSync(data.pipeline_run?.artifacts?.retrieval_path ?? ""));
    assert.ok(fs.existsSync(data.pipeline_run?.artifacts?.llm_transcript_path ?? ""));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("git hydrate-intents machine mode executes vendored deterministic retrieval pipeline", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-hydrate-run-"));
  try {
    const repoPath = path.join(tmpDir, "repo");
    fs.mkdirSync(repoPath, { recursive: true });
    fs.writeFileSync(
      path.join(repoPath, "feature.ts"),
      "export function hydratedFeature(): boolean {\n  return true;\n}\n",
      "utf8",
    );
    const outPath = path.join(tmpDir, "result.json");
    const env = {
      ...process.env,
      MERGETONIC_LICENSE_ACCEPTED: "1",
      TONIC_CHROMA_MODE: "memory",
    };
    const { status } = runCli(
      [
        "git",
        "--repo",
        repoPath,
        "hydrate-intents",
        "--out-json",
        outPath,
        "--intent-text",
        "map feature hydration context",
        "--max-questions",
        "2",
        "--query-top-k",
        "3",
      ],
      env,
    );
    assert.equal(status, 0);
    const data = JSON.parse(fs.readFileSync(outPath, "utf8")) as {
      hydration_skipped: boolean;
      retrieval_bundles: Array<{ ast_candidates?: Array<{ node_kind?: string; symbol?: string }> }>;
      tags_added: Array<{ key: string; value: string }>;
      fuzzy_alignment: unknown[];
      hydration_cycle?: { nodes?: unknown[]; total_cycles?: number; cycles?: unknown[] };
      metadata_consolidation?: { paths_ranked?: unknown[]; candidate_tags?: unknown[] };
      metadata: { indexed_chunks?: number };
      pipeline_run?: {
        run_status?: string;
        artifacts?: { retrieval_path?: string; hydration_cycle_path?: string; hydration_result_path?: string; metadata_consolidation_path?: string };
      };
    };
    assert.equal(data.hydration_skipped, false);
    assert.ok(Array.isArray(data.retrieval_bundles));
    assert.ok(data.retrieval_bundles.length >= 1);
    assert.ok(
      data.retrieval_bundles.some((bundle) =>
        (bundle.ast_candidates ?? []).some((candidate) => candidate.node_kind === "function" && candidate.symbol === "hydratedFeature"),
      ),
    );
    assert.ok(Array.isArray(data.tags_added));
    assert.ok(data.tags_added.length >= 1);
    assert.ok(Array.isArray(data.fuzzy_alignment));
    assert.ok(data.fuzzy_alignment.length >= 1);
    assert.ok((data.hydration_cycle?.nodes?.length ?? 0) >= 1);
    assert.ok((data.hydration_cycle?.total_cycles ?? 0) >= 1);
    assert.equal((data.hydration_cycle?.cycles?.length ?? 0), data.hydration_cycle?.total_cycles ?? 0);
    assert.ok((data.metadata_consolidation?.paths_ranked?.length ?? 0) >= 1);
    assert.ok((data.metadata_consolidation?.candidate_tags?.length ?? 0) >= 1);
    assert.ok((data.metadata.indexed_chunks ?? 0) >= 1);
    assert.equal(data.pipeline_run?.run_status, "completed");
    assert.ok(fs.existsSync(data.pipeline_run?.artifacts?.retrieval_path ?? ""));
    assert.ok(fs.existsSync(data.pipeline_run?.artifacts?.hydration_cycle_path ?? ""));
    assert.ok(fs.existsSync(data.pipeline_run?.artifacts?.metadata_consolidation_path ?? ""));
    assert.ok(fs.existsSync(data.pipeline_run?.artifacts?.hydration_result_path ?? ""));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("git hydrate-intents supports --intent-spec and rejects malformed specs", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-hydrate-intent-spec-"));
  try {
    const repoPath = path.join(tmpDir, "repo");
    fs.mkdirSync(repoPath, { recursive: true });
    fs.writeFileSync(path.join(repoPath, "main.ts"), "export const x = 1;\n", "utf8");
    const validSpecPath = path.join(repoPath, "intent-spec.json");
    fs.writeFileSync(
      validSpecPath,
      JSON.stringify(
        {
          schema: "tonic-intent-spec",
          intents: [{ id: "intent-auth", description: "stabilize auth flow" }],
        },
        null,
        2,
      ),
      "utf8",
    );
    const outPath = path.join(tmpDir, "valid.json");
    const env = { ...process.env, MERGETONIC_LICENSE_ACCEPTED: "1", TONIC_CHROMA_MODE: "memory" };
    const ok = runCli(
      ["git", "--repo", repoPath, "hydrate-intents", "--out-json", outPath, "--intent-spec", validSpecPath],
      env,
    );
    assert.equal(ok.status, 0, ok.stderr);
    const valid = JSON.parse(fs.readFileSync(outPath, "utf8")) as { branch_intents?: { branch_intents?: Array<{ source_kind?: string }> } };
    assert.ok((valid.branch_intents?.branch_intents?.length ?? 0) >= 1);
    assert.equal(valid.branch_intents?.branch_intents?.[0]?.source_kind, "file");

    const malformedSpecPath = path.join(repoPath, "bad-intent-spec.json");
    fs.writeFileSync(malformedSpecPath, "{bad json", "utf8");
    const badOutPath = path.join(tmpDir, "bad.json");
    const bad = runCli(
      ["git", "--repo", repoPath, "hydrate-intents", "--out-json", badOutPath, "--intent-spec", malformedSpecPath],
      env,
    );
    assert.equal(bad.status, 1);
    const badPayload = JSON.parse(fs.readFileSync(badOutPath, "utf8")) as { error?: string };
    assert.match(badPayload.error ?? "", /Failed to parse --intent-spec/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("git hydrate-intents enforces scope, dry-run, and custom llm transcript path", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-hydrate-scope-dryrun-"));
  try {
    const repoPath = path.join(tmpDir, "repo");
    fs.mkdirSync(path.join(repoPath, "src"), { recursive: true });
    fs.mkdirSync(path.join(repoPath, "docs"), { recursive: true });
    fs.writeFileSync(path.join(repoPath, "src", "focused.ts"), "export function focusedScope(): boolean { return true; }\n", "utf8");
    fs.writeFileSync(path.join(repoPath, "docs", "ignored.md"), "ignored content\n", "utf8");
    const llmPath = path.join(tmpDir, "custom-llm.jsonl");
    const outPath = path.join(tmpDir, "result.json");
    const env = { ...process.env, MERGETONIC_LICENSE_ACCEPTED: "1", TONIC_CHROMA_MODE: "memory" };
    const { status } = runCli(
      [
        "git",
        "--repo",
        repoPath,
        "hydrate-intents",
        "--out-json",
        outPath,
        "--scope",
        "src/**",
        "--dry-run",
        "--log-llm",
        llmPath,
      ],
      env,
    );
    assert.equal(status, 0);
    const data = JSON.parse(fs.readFileSync(outPath, "utf8")) as {
      retrieval_bundles?: Array<{ vector_hits?: Array<{ path?: string }> }>;
      metadata?: { dry_run?: boolean; scope?: string };
      pipeline_run?: { artifacts?: { llm_transcript_path?: string; index_state_path?: string } };
    };
    assert.ok(
      (data.retrieval_bundles ?? []).every((bundle) =>
        (bundle.vector_hits ?? []).every((hit) => (hit.path ?? "").startsWith("src/")),
      ),
    );
    assert.equal(data.metadata?.dry_run, true);
    assert.equal(data.metadata?.scope, "src/**");
    assert.equal(path.resolve(data.pipeline_run?.artifacts?.llm_transcript_path ?? ""), path.resolve(llmPath));
    assert.ok(fs.existsSync(llmPath));
    assert.equal(fs.existsSync(data.pipeline_run?.artifacts?.index_state_path ?? ""), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("git hydrate-intents emits multi-cycle records with narrowed follow-up targets", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-hydrate-multicycle-"));
  try {
    const repoPath = path.join(tmpDir, "repo");
    fs.mkdirSync(path.join(repoPath, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(repoPath, "src", "auth.ts"),
      "export function resolveAuth(user: string): string {\n  return user;\n}\n\nexport function authPolicy(): string {\n  return resolveAuth('a');\n}\n",
      "utf8",
    );
    const outPath = path.join(tmpDir, "result.json");
    const env = { ...process.env, MERGETONIC_LICENSE_ACCEPTED: "1", TONIC_CHROMA_MODE: "memory" };
    const { status } = runCli(
      [
        "git",
        "--repo",
        repoPath,
        "hydrate-intents",
        "--out-json",
        outPath,
        "--max-questions",
        "5",
        "--query-top-k",
        "3",
      ],
      env,
    );
    assert.equal(status, 0);
    const data = JSON.parse(fs.readFileSync(outPath, "utf8")) as {
      hydration_cycle?: {
        total_cycles?: number;
        cycles?: Array<{ targets?: Array<{ level?: string; symbol?: string }>; question_slots?: Array<{ question?: string }> }>;
      };
    };
    assert.ok((data.hydration_cycle?.total_cycles ?? 0) >= 2);
    const cycleOneTargets = data.hydration_cycle?.cycles?.[0]?.targets ?? [];
    const cycleTwoTargets = data.hydration_cycle?.cycles?.[1]?.targets ?? [];
    assert.ok(cycleOneTargets.some((target) => target.level === "branch"));
    assert.ok(cycleTwoTargets.some((target) => target.level !== "branch"));
    const allQuestions = (data.hydration_cycle?.cycles ?? []).flatMap((cycle) =>
      (cycle.question_slots ?? []).map((slot) => slot.question ?? ""),
    );
    const unique = new Set(allQuestions.map((question) => question.toLowerCase().trim()).filter(Boolean));
    assert.equal(unique.size, allQuestions.length);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
