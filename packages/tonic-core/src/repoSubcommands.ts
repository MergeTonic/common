import * as fs from "node:fs";
import * as path from "node:path";
import { runHydrationPipelineFromArgv } from "./hydration/hydrateCommand";
import { gitCmdFetch, gitMain } from "./gitSubcommands";
import { parseManifestJson } from "./weaveGit/manifest";
import {
  defaultRepoProfile,
  mergeRepoProfiles,
  readRepoProfile,
  refsToFetchFromProfile,
  repoProfilePath,
  writeRepoProfile,
  type TonicRepoProfileV1,
} from "./repoProfile/repoProfile";
import { resolveRemoteSpec } from "./remoteSpec";

function getArg(argv: string[], name: string, def: string): string {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("-")) {
    return argv[i + 1]!;
  }
  return def;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function stripRepoFlag(argv: string[]): { repo: string; rest: string[] } {
  let repo = ".";
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if ((a === "--repo" || a === "-R") && argv[i + 1]) {
      repo = path.resolve(argv[i + 1]!);
      i++;
      continue;
    }
    rest.push(a);
  }
  return { repo, rest };
}

function collectBranches(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--branch" || argv[i] === "--ref") {
      const v = argv[i + 1];
      if (v && !v.startsWith("-")) {
        out.push(v);
        i++;
      }
    }
  }
  return out;
}

function ensureWeaveInitIdempotent(repoRoot: string): void {
  const root = path.join(repoRoot, ".tonic", "weave");
  const manPath = path.join(root, "manifest.json");
  fs.mkdirSync(path.join(root, "blobs"), { recursive: true });
  if (fs.existsSync(manPath)) {
    try {
      parseManifestJson(fs.readFileSync(manPath, "utf8"));
      return;
    } catch {
      /* rewrite below */
    }
  }
  const man = {
    schema: "tonic-git-manifest" as const,
    version: "1" as const,
    commit: "0000000000000000000000000000000000000000",
    paths: {},
  };
  fs.writeFileSync(manPath, JSON.stringify(man, null, 2) + "\n", "utf8");
}

async function cmdRepoInit(repoRoot: string, argv: string[]): Promise<number> {
  fs.mkdirSync(path.join(repoRoot, ".tonic"), { recursive: true });
  ensureWeaveInitIdempotent(repoRoot);

  const existing = readRepoProfile(repoRoot);
  const patch: Partial<TonicRepoProfileV1> = {};
  const remote = getArg(argv, "--remote", "");
  if (remote.trim()) {
    patch.remote = remote.trim();
  }
  const cr = getArg(argv, "--canonical-ref", "");
  if (cr.trim()) {
    patch.canonical_ref = cr.trim();
  }
  const lr = getArg(argv, "--left-ref", "");
  if (lr.trim()) {
    patch.left_ref = lr.trim();
  }
  const rr = getArg(argv, "--right-ref", "");
  if (rr.trim()) {
    patch.right_ref = rr.trim();
  }
  const ip = getArg(argv, "--intent-pair", "");
  if (ip.trim()) {
    patch.intent_pair = ip.trim();
  }
  const prof = getArg(argv, "--intent-profile", "");
  if (prof.trim()) {
    patch.intent_profile = prof.trim();
  }
  const hod = getArg(argv, "--hydrate-out-dir", "");
  if (hod.trim()) {
    patch.hydrate_out_dir = hod.trim();
  }
  const hub = getArg(argv, "--hub-repo-id", "");
  if (hub.trim()) {
    patch.hub_repo_id = hub.trim();
  }
  const cm = getArg(argv, "--compare-mode", "").toLowerCase();
  if (cm === "weave" || cm === "snapshot") {
    patch.compare_mode = cm;
  }
  const gitUrl = getArg(argv, "--git-remote-url", "");
  if (gitUrl.trim()) {
    patch.git_remote_url = gitUrl.trim();
  }

  const merged = mergeRepoProfiles(existing ?? defaultRepoProfile(), patch);
  writeRepoProfile(repoRoot, merged);

  if (hasFlag(argv, "--fetch")) {
    const refs = [...refsToFetchFromProfile(merged), ...collectBranches(argv)];
    const uniq = [...new Set(refs)];
    const fetchArgv = ["--remote", merged.remote, ...uniq.flatMap((r) => ["--ref", r])];
    const fr = gitCmdFetch(repoRoot, fetchArgv);
    if (fr !== 0) {
      return fr;
    }
  }

  console.log(JSON.stringify({ ok: true, profile_path: repoProfilePath(repoRoot) }));
  return 0;
}

async function cmdRepoFetch(repoRoot: string, argv: string[]): Promise<number> {
  const prof = readRepoProfile(repoRoot) ?? defaultRepoProfile();
  const remote = getArg(argv, "--remote", "").trim() || prof.remote;
  const refs = [...refsToFetchFromProfile(prof), ...collectBranches(argv)];
  const uniq = [...new Set(refs)];
  const fetchArgv = ["--remote", remote, ...uniq.flatMap((r) => ["--ref", r])];
  return gitCmdFetch(repoRoot, fetchArgv);
}

function profileCompareArgv(repoRoot: string, prof: TonicRepoProfileV1 | null, argv: string[]): string[] {
  const out = [...argv];
  const p = prof ?? defaultRepoProfile();
  const ensure = (flag: string, val: string) => {
    if (!val.trim()) {
      return;
    }
    if (!out.some((x, i) => x === flag && out[i + 1])) {
      out.push(flag, val);
    }
  };
  ensure("--remote", p.remote);
  ensure("--left-ref", p.left_ref ?? "");
  ensure("--right-ref", p.right_ref ?? "");
  ensure("--intent-pair", p.intent_pair ?? "");
  const ipath = (p.intent_profile ?? "").trim();
  if (ipath) {
    const abs = path.isAbsolute(ipath) ? ipath : path.join(repoRoot, ipath);
    ensure("--intent-profile", abs);
  }
  return out;
}

async function cmdRepoCompare(repoRoot: string, argv: string[]): Promise<number> {
  const prof = readRepoProfile(repoRoot);
  const tonicMeta = prof ? { ...prof } : undefined;
  const mergedArgv = profileCompareArgv(repoRoot, prof, argv);
  const rc = await gitMain(repoRoot, ["compare", ...mergedArgv]);
  if (rc !== 0) {
    return rc;
  }
  const reportIdx = mergedArgv.indexOf("--report");
  if (reportIdx >= 0 && mergedArgv[reportIdx + 1] && tonicMeta) {
    const rp = mergedArgv[reportIdx + 1]!;
    try {
      const raw = fs.readFileSync(rp, "utf8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      data.tonic_repo_profile = tonicMeta;
      fs.writeFileSync(rp, JSON.stringify(data, null, 2) + "\n", "utf8");
    } catch {
      /* ignore */
    }
  }
  return 0;
}

async function cmdRepoCompareThree(repoRoot: string, argv: string[]): Promise<number> {
  const prof = readRepoProfile(repoRoot);
  const merged = [...argv];
  const canon = (prof?.canonical_ref ?? "").trim();
  if (canon && !argv.includes("--base-ref")) {
    merged.push("--base-ref", canon);
  }
  const hub = (prof?.hub_repo_id ?? "").trim();
  if (hub && !argv.includes("--hub-repo-id")) {
    merged.push("--hub-repo-id", hub);
  }
  const mergedArgv = profileCompareArgv(repoRoot, prof, merged);
  return gitMain(repoRoot, ["compare-three", ...mergedArgv]);
}

async function cmdRepoHydrate(repoRoot: string, argv: string[]): Promise<number> {
  const prof = readRepoProfile(repoRoot);
  const prefix: string[] = [];
  if (prof) {
    if (!(argv.includes("--repo") || argv.includes("-R"))) {
      prefix.push("--repo", repoRoot);
    }
    const od = (prof.hydrate_out_dir ?? "").trim();
    if (od && !argv.includes("--out-dir")) {
      prefix.push("--out-dir", path.isAbsolute(od) ? od : path.join(repoRoot, od));
    }
    const ip = (prof.intent_profile ?? "").trim();
    if (ip && !argv.includes("--intent-profile")) {
      prefix.push("--intent-profile", path.isAbsolute(ip) ? ip : path.join(repoRoot, ip));
    }
    const pair = (prof.intent_pair ?? "").trim();
    if (pair && !argv.includes("--intent-pair")) {
      prefix.push("--intent-pair", pair);
    }
    if ((prof.compare_mode ?? "") === "weave" && !argv.includes("--enable-retrieval")) {
      /* optional hint only — hydration pipeline unchanged */
    }
  } else {
    if (!(argv.includes("--repo") || argv.includes("-R"))) {
      prefix.push("--repo", repoRoot);
    }
  }
  return runHydrationPipelineFromArgv([...prefix, ...argv]);
}

/** `merge-tonic repo resolve <spec>` — classify path / GitHub / Hub (stdout JSON). */
function cmdRepoResolve(_repoRoot: string, argv: string[]): number {
  const spec = argv[0] ?? "";
  const res = resolveRemoteSpec(spec);
  if (!res) {
    console.log(JSON.stringify({ ok: false, spec, error: "unrecognized_spec" }));
    return 1;
  }
  if (res.kind === "path") {
    console.log(JSON.stringify({ ok: true, kind: "path", path: res.path }));
    return 0;
  }
  if (res.kind === "github") {
    console.log(JSON.stringify({ ok: true, kind: "github", url: res.url }));
    return 0;
  }
  console.log(JSON.stringify({ ok: true, kind: "hub", repo_id: res.repoId }));
  return 0;
}

export async function runRepoFromArgv(argv: string[]): Promise<number> {
  const { repo, rest } = stripRepoFlag(argv);
  const sub = rest[0];
  const tail = rest.slice(1);
  if (!sub || sub === "-h" || sub === "--help") {
    console.error(
      "Usage: merge-tonic repo [--repo DIR] init|fetch|compare|compare-three|hydrate|resolve ...",
    );
    return sub ? 0 : 1;
  }
  if (sub === "init") {
    return cmdRepoInit(repo, tail);
  }
  if (sub === "fetch") {
    return cmdRepoFetch(repo, tail);
  }
  if (sub === "compare" || sub === "c") {
    return cmdRepoCompare(repo, tail);
  }
  if (sub === "compare-three" || sub === "c3") {
    return cmdRepoCompareThree(repo, tail);
  }
  if (sub === "hydrate" || sub === "h") {
    return cmdRepoHydrate(repo, tail);
  }
  if (sub === "resolve") {
    return cmdRepoResolve(repo, tail);
  }
  console.error(`unknown repo subcommand: ${sub}`);
  return 1;
}
