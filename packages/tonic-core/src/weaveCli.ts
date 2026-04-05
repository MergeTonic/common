import { execFileSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { readRepoProfile } from "./repoProfile/repoProfile";
import { deserializeState } from "./state";
import { parseManifestJson, serializeManifestJson } from "./weaveGit/manifest";
import { persistCheckpointWeaveBlob, replaySteps, stateHash, type ReplayStep } from "./weaveGit/replay";
import {
  applyLfsPointerChecks,
  type VerifyResult,
  verifyManifest,
  verifyReportDict,
  verifyStaged,
  weaveBlobPath,
} from "./weaveGit/verify";
import { inspectRowsJson, splitWeaveIndexAfterVisible, WeaveIntrospectError } from "./weaveIntrospect";
import { extractWeaveRows, spliceWeaveRows, WeaveExtractError, WeaveSpliceError } from "./weaveSlice";

function getArg(argv: string[], name: string, def: string): string {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) {
    return argv[i + 1]!;
  }
  return def;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function isHubWriteAuthError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("TONIC_HF_WEAVE_HUB_TOKEN_REQUIRED");
}

function defaultHubRepoId(): string {
  return (process.env.TONIC_HF_WEAVE_REPO ?? process.env.HF_WEAVE_HUB_REPO ?? "").trim();
}

function readHfRepoJson(repoRoot: string): string {
  try {
    const p = path.join(repoRoot, ".tonic", "hf-repo.json");
    if (!fs.existsSync(p)) {
      return "";
    }
    const o = JSON.parse(fs.readFileSync(p, "utf8")) as { repo_id?: string };
    return typeof o.repo_id === "string" ? o.repo_id.trim() : "";
  } catch {
    return "";
  }
}

export function resolveHubRepoIdForWeave(repoRoot: string, repoIdArg: string): string {
  const a = repoIdArg.trim();
  if (a) {
    return a;
  }
  const m = readHfRepoJson(repoRoot);
  if (m) {
    return m;
  }
  const prof = readRepoProfile(repoRoot);
  return (prof?.hub_repo_id ?? "").trim() || defaultHubRepoId();
}

function weaveBlobShasFromManifest(repoRoot: string): string[] {
  const mpath = path.join(repoRoot, ".tonic", "weave", "manifest.json");
  if (!fs.existsSync(mpath)) {
    return [];
  }
  try {
    const data: unknown = JSON.parse(fs.readFileSync(mpath, "utf8"));
    const paths = (data as { paths?: unknown }).paths;
    if (typeof paths !== "object" || paths === null || Array.isArray(paths)) {
      return [];
    }
    const out: string[] = [];
    for (const e of Object.values(paths as Record<string, unknown>)) {
      if (typeof e !== "object" || e === null) {
        continue;
      }
      const w = (e as { weave_serialized_sha?: string }).weave_serialized_sha;
      if (typeof w === "string" && w) {
        out.push(w);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function shouldPublishCtRd(argv: string[]): boolean {
  if (hasFlag(argv, "--publish-ctrd")) {
    return true;
  }
  const v = (process.env.TONIC_WEAVE_PUBLISH_CTRD ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function allowReplayHub(): boolean {
  const v = (process.env.TONIC_WEAVE_REPLAY_HUB ?? "1").toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

function loadWeaveBlobText(repo: string, argv: string[]): string {
  const weaveFile = getArg(argv, "--weave-file", "").trim();
  if (weaveFile) {
    const p = path.resolve(weaveFile);
    if (!fs.existsSync(p)) {
      throw new Error(`missing weave file ${p}`);
    }
    return fs.readFileSync(p, "utf8");
  }
  const manifestPath = getArg(argv, "--manifest", getArg(argv, "-m", ""));
  const mpath = manifestPath ? path.resolve(manifestPath) : path.join(repo, ".tonic", "weave", "manifest.json");
  if (!fs.existsSync(mpath)) {
    throw new Error(`missing manifest ${mpath}`);
  }
  const logicalPath = getArg(argv, "--path", getArg(argv, "-p", "")).trim();
  if (!logicalPath) {
    throw new Error("need --weave-file or manifest --path");
  }
  const manifest = parseManifestJson(fs.readFileSync(mpath, "utf8"));
  const ent = manifest.paths[logicalPath];
  if (!ent) {
    throw new Error(`path not in manifest: ${logicalPath}`);
  }
  const sha = ent.weave_serialized_sha;
  if (!sha) {
    throw new Error("manifest row missing weave_serialized_sha");
  }
  const wr = getArg(argv, "--weave-root", "").trim();
  const weaveRoot = wr ? path.resolve(wr) : path.join(repo, ".tonic", "weave");
  const blob = weaveBlobPath(weaveRoot, sha);
  if (!fs.existsSync(blob)) {
    throw new Error(`missing weave blob ${blob}`);
  }
  return fs.readFileSync(blob, "utf8");
}

function parseWeaveRange(spec: string): [number, number] {
  const idx = spec.indexOf(":");
  if (idx < 0) {
    throw new Error("--range must be START:END (half-open weave indices)");
  }
  const a = parseInt(spec.slice(0, idx).trim(), 10);
  const b = parseInt(spec.slice(idx + 1).trim(), 10);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error("invalid --range integers");
  }
  return [a, b];
}

function gitHeadSha(repoRoot: string): string | null {
  try {
    const out = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function gitAddWeavePaths(repoRoot: string): void {
  const man = path.join(repoRoot, ".tonic", "weave", "manifest.json");
  if (fs.existsSync(man)) {
    execFileSync("git", ["add", "--", ".tonic/weave/manifest.json"], { cwd: repoRoot, stdio: "pipe" });
  }
  const blobs = path.join(repoRoot, ".tonic", "weave", "blobs");
  if (fs.existsSync(blobs)) {
    execFileSync("git", ["add", "--", ".tonic/weave/blobs"], { cwd: repoRoot, stdio: "pipe" });
  }
}

function gitCommitStaged(repoRoot: string, message: string): number {
  try {
    execSync("git diff --cached --quiet", { cwd: repoRoot, stdio: "pipe" });
    console.error("weave sync: git commit skipped (nothing staged)");
    return 0;
  } catch {
    /* has staged changes */
  }
  try {
    execSync(`git commit -m ${JSON.stringify(message)}`, { cwd: repoRoot, stdio: "inherit" });
    return 0;
  } catch {
    console.error("weave sync: git commit failed");
    return 1;
  }
}

/** Parity with `merge-tonic weave` argv (see scripts/weave/cli_argv_manifest.json). */
export async function runWeaveFromArgv(argv: string[]): Promise<number> {
  const sub = argv[0];
  if (!sub || sub === "-h" || sub === "--help") {
    console.error(
      "Usage: merge-tonic weave verify|install-hooks|replay|inspect|extract|splice|sync|init|doctor|push|pull ...",
    );
    return sub ? 0 : 1;
  }
  if (sub === "doctor") {
    console.log(
      "weave doctor: merge-tonic weave sync/push/pull use @mergetonic/hf-weave when installed (dynamic import). " +
        "Set HF_TOKEN for Hub writes when not offline; HF_HUB_OFFLINE=1 or TONIC_HF_WEAVE_OFFLINE=1 skips Hub I/O. " +
        "Repo id: .tonic/hf-repo.json, profile hub_repo_id, or TONIC_HF_WEAVE_REPO.",
    );
    return 0;
  }
  const repo = path.resolve(getArg(argv, "--repo", getArg(argv, "-R", ".")));

  if (sub === "push") {
    const rid = resolveHubRepoIdForWeave(repo, getArg(argv, "--repo-id", ""));
    const { hubWeaveOffline, hubPushLocalWeaveBlobs, refreshWeaveHubIndex } = await import("@mergetonic/hf-weave");
    if (hubWeaveOffline()) {
      console.error("weave push: offline (HF_HUB_OFFLINE / TONIC_HF_WEAVE_OFFLINE)");
      return 0;
    }
    if (!rid) {
      console.error("weave push: missing repo id (.tonic/hf-repo.json or TONIC_HF_WEAVE_REPO)");
      return 1;
    }
    const blobsDir = path.join(repo, ".tonic", "weave", "blobs");
    try {
      const n = await hubPushLocalWeaveBlobs({ weaveBlobsDir: blobsDir, repoId: rid });
      console.error(`weave push: uploaded ${n} blob(s)`);
      if (hasFlag(argv, "--update-index")) {
        await refreshWeaveHubIndex({ repoRoot: repo, repoId: rid });
      }
    } catch (e) {
      if (isHubWriteAuthError(e)) {
        console.error(
          "weave push: Hub write failed (missing HF_TOKEN). Set HF_TOKEN or use HF_HUB_OFFLINE=1 to skip uploads.",
        );
        return 1;
      }
      throw e;
    }
    return 0;
  }

  if (sub === "pull") {
    const rid = resolveHubRepoIdForWeave(repo, getArg(argv, "--repo-id", ""));
    const { hubWeaveOffline, hubPrefetchBlobKeys } = await import("@mergetonic/hf-weave");
    if (hubWeaveOffline()) {
      return 0;
    }
    if (!rid) {
      console.error("weave pull: missing repo id");
      return 1;
    }
    const keys = weaveBlobShasFromManifest(repo);
    if (keys.length === 0) {
      console.error("weave pull: no keys from manifest");
      return 1;
    }
    const dest = path.join(repo, ".tonic", "weave", "blobs");
    const n = await hubPrefetchBlobKeys({ keys, repoId: rid, destDir: dest });
    console.error(`weave pull: fetched ${n} blob(s) into ${dest}`);
    return 0;
  }

  if (sub === "init") {
    const root = path.join(repo, ".tonic", "weave");
    fs.mkdirSync(path.join(root, "blobs"), { recursive: true });
    const man = {
      schema: "tonic-git-manifest" as const,
      version: "1" as const,
      commit: "0000000000000000000000000000000000000000",
      paths: {},
    };
    fs.writeFileSync(path.join(root, "manifest.json"), serializeManifestJson(man), "utf8");
    console.log(`initialized ${path.join(root, "manifest.json")}`);
    return 0;
  }
  if (sub === "install-hooks") {
    const cmd = getArg(argv, "--mergetonic-cmd", "merge-tonic");
    const gitHooks = path.join(repo, ".git", "hooks");
    if (!fs.existsSync(path.join(repo, ".git"))) {
      console.error("install-hooks: not a git repository");
      return 1;
    }
    fs.mkdirSync(gitHooks, { recursive: true });
    const preCommit = `#!/bin/sh
# mergetonic hf-weave: verify staged weave manifest
${cmd} weave verify --staged --repo "$(git rev-parse --show-toplevel)" || exit 1
`;
    const prePush = `#!/bin/sh
# mergetonic hf-weave: push notes ref alongside branch (best-effort)
repo="$(git rev-parse --show-toplevel)"
cd "$repo" || exit 0
if git show-ref --verify --quiet refs/notes/tonic 2>/dev/null; then
  git push "$1" refs/notes/tonic:refs/notes/tonic || true
fi
exit 0
`;
    const postStub = `#!/bin/sh
# mergetonic hf-weave: optional prefetch stub (no network by default)
# Run: hf weave prefetch  (when mergetonic-hf-weave installed)
true
`;
    const hookBodies: [string, string][] = [
      ["pre-commit", preCommit],
      ["pre-push", prePush],
      ["post-merge", postStub],
      ["post-checkout", postStub],
    ];
    for (const [name, body] of hookBodies) {
      const hp = path.join(gitHooks, name);
      fs.writeFileSync(hp, body, "utf8");
      try {
        fs.chmodSync(hp, 0o755);
      } catch {
        /* Windows */
      }
      console.log(`wrote ${hp}`);
    }
    return 0;
  }
  if (sub === "verify") {
    const manifestPath = getArg(argv, "--manifest", getArg(argv, "-m", ""));
    const mpath = manifestPath
      ? path.resolve(manifestPath)
      : path.join(repo, ".tonic", "weave", "manifest.json");
    if (!fs.existsSync(mpath)) {
      console.error(`weave verify: missing manifest ${mpath}`);
      return 1;
    }
    const raw = fs.readFileSync(mpath, "utf8");
    const wr = getArg(argv, "--weave-root", "");
    const weaveRoot = wr ? path.resolve(wr) : path.join(repo, ".tonic", "weave");
    const strict = hasFlag(argv, "--strict");
    const staged = hasFlag(argv, "--staged") || hasFlag(argv, "-s");
    const checkLfs = hasFlag(argv, "--check-lfs");
    let vr: VerifyResult;
    if (staged) {
      vr = verifyStaged(repo, raw, { weaveRoot, strict });
    } else {
      vr = verifyManifest(repo, parseManifestJson(raw), { weaveRoot, strict });
    }
    vr = applyLfsPointerChecks(vr, repo, { checkLfs });
    if (hasFlag(argv, "--json") || hasFlag(argv, "-j")) {
      console.log(JSON.stringify(verifyReportDict(repo, vr), null, 2));
    } else {
      for (const c of vr.checks) {
        console.log(`${c.ok ? "ok" : "FAIL"} ${c.id} ${c.message}`);
      }
      for (const e of vr.errors) {
        console.error(`error ${e.code}: ${e.message}`);
      }
    }
    return vr.ok ? 0 : 1;
  }

  if (sub === "replay") {
    return runWeaveReplayFromArgv(argv);
  }

  if (sub === "inspect") {
    try {
      const raw = loadWeaveBlobText(repo, argv.slice(1));
      console.log(JSON.stringify(inspectRowsJson(deserializeState(raw)), null, 2));
      return 0;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`weave inspect: ${msg}`);
      return 1;
    }
  }

  if (sub === "extract") {
    const rangeSpec = getArg(argv.slice(1), "--range", "");
    if (!rangeSpec) {
      console.error("weave extract: need --range START:END");
      return 1;
    }
    try {
      const raw = loadWeaveBlobText(repo, argv.slice(1));
      const [wa, wb] = parseWeaveRange(rangeSpec);
      const out = extractWeaveRows(raw, wa, wb);
      const outp = getArg(argv.slice(1), "--out", getArg(argv.slice(1), "-o", ""));
      if (outp.trim()) {
        fs.writeFileSync(path.resolve(outp), out, "utf8");
      } else {
        process.stdout.write(out);
      }
      return 0;
    } catch (e) {
      const msg =
        e instanceof WeaveExtractError || e instanceof WeaveIntrospectError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      console.error(`weave extract: ${msg}`);
      return 1;
    }
  }

  if (sub === "splice") {
    const rest = argv.slice(1);
    const targetWeave = getArg(rest, "--target-weave", "");
    const fragmentWeave = getArg(rest, "--fragment-weave", "");
    const outPath = getArg(rest, "--out", getArg(rest, "-o", ""));
    if (!targetWeave || !fragmentWeave) {
      console.error("weave splice: need --target-weave and --fragment-weave");
      return 1;
    }
    if (!outPath.trim()) {
      console.error("weave splice: need --out PATH");
      return 1;
    }
    const splitStr = getArg(rest, "--split", "");
    const afterVisStr = getArg(rest, "--after-visible", "");
    try {
      const target = fs.readFileSync(path.resolve(targetWeave), "utf8");
      const frag = fs.readFileSync(path.resolve(fragmentWeave), "utf8");
      let split: number;
      if (splitStr.trim() !== "") {
        split = parseInt(splitStr, 10);
        if (Number.isNaN(split)) {
          throw new Error("invalid --split");
        }
      } else if (afterVisStr.trim() !== "") {
        const av = parseInt(afterVisStr, 10);
        if (Number.isNaN(av)) {
          throw new Error("invalid --after-visible");
        }
        split = splitWeaveIndexAfterVisible(deserializeState(target), av);
      } else {
        console.error("weave splice: provide --split or --after-visible");
        return 1;
      }
      const out = spliceWeaveRows(target, frag, split);
      fs.writeFileSync(path.resolve(outPath), out, "utf8");
      return 0;
    } catch (e) {
      const msg =
        e instanceof WeaveSpliceError || e instanceof WeaveExtractError || e instanceof WeaveIntrospectError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      console.error(`weave splice: ${msg}`);
      return 1;
    }
  }

  if (sub === "sync") {
    return runWeaveSyncFromArgv(argv, repo, undefined);
  }

  console.error(`unknown weave subcommand: ${sub}`);
  return 1;
}

async function runWeaveReplayFromArgv(argv: string[]): Promise<number> {
  const repo = path.resolve(getArg(argv, "--repo", getArg(argv, "-R", ".")));
  const manifestPath = getArg(argv, "--manifest", getArg(argv, "-m", ""));
  const mpath = manifestPath
    ? path.resolve(manifestPath)
    : path.join(repo, ".tonic", "weave", "manifest.json");
  if (!fs.existsSync(mpath)) {
    console.error(`weave replay: missing manifest ${mpath}`);
    return 1;
  }
  const logicalPath = getArg(argv, "--path", getArg(argv, "-p", ""));
  if (!logicalPath) {
    console.error("weave replay: need --path <manifest key>");
    return 1;
  }
  const rawMan = fs.readFileSync(mpath, "utf8");
  const manifest = parseManifestJson(rawMan);
  if (!manifest.paths[logicalPath]) {
    console.error(`weave replay: path not in manifest: ${logicalPath}`);
    return 1;
  }
  const entry = manifest.paths[logicalPath]!;

  const stepsJson = getArg(argv, "--steps-json", "");
  let steps: ReplayStep[] | null = null;

  if (stepsJson && fs.existsSync(stepsJson)) {
    const rawSteps = JSON.parse(fs.readFileSync(stepsJson, "utf8")) as unknown;
    if (!Array.isArray(rawSteps)) {
      console.error("weave replay: steps-json must be a JSON array");
      return 1;
    }
    steps = rawSteps.map((s: unknown) => {
      const o = s as { commit?: string; lines?: string[] };
      return { commit: String(o.commit ?? ""), lines: Array.isArray(o.lines) ? o.lines.map(String) : [] };
    });
  } else {
    let traceKey = getArg(argv, "--trace-key", "").trim();
    if (!traceKey && hasFlag(argv, "--from-hub")) {
      const rk = entry.replay_trace_key;
      if (typeof rk === "string" && rk.trim()) {
        traceKey = rk.trim();
      }
    }
    if (traceKey) {
      if (!allowReplayHub()) {
        console.error("weave replay: TONIC_WEAVE_REPLAY_HUB=0 disables Hub CTRD fetch; pass --steps-json");
        return 1;
      }
      const rid = resolveHubRepoIdForWeave(repo, getArg(argv, "--repo-id", ""));
      if (!rid) {
        console.error("weave replay: set hub_repo_id in .tonic/repo.json or TONIC_HF_WEAVE_REPO for --from-hub");
        return 1;
      }
      const { fetchCtRdFromHub } = await import("@mergetonic/hf-weave");
      const doc = await fetchCtRdFromHub(rid, traceKey);
      if (doc === null) {
        console.error(`weave replay: CTRD ${traceKey.slice(0, 16)}… not found on Hub (offline?)`);
        return 1;
      }
      const rawSteps = doc.steps;
      if (!Array.isArray(rawSteps)) {
        console.error("weave replay: CTRD missing steps array");
        return 1;
      }
      steps = [];
      for (const s of rawSteps) {
        if (typeof s === "object" && s !== null && typeof (s as { commit?: string }).commit === "string") {
          const o = s as { commit: string; lines?: unknown };
          const lines = o.lines;
          steps.push({
            commit: o.commit,
            lines: Array.isArray(lines) ? lines.map(String) : [],
          });
        }
      }
    }
    if (steps === null || steps.length === 0) {
      console.error(
        "weave replay: pass --steps-json, or --trace-key / --from-hub with manifest replay_trace_key and Hub access",
      );
      return 1;
    }
  }

  const checkpointEvery = parseInt(getArg(argv, "--checkpoint-every", "0"), 10) || 0;
  const persistRoot = getArg(argv, "--persist-checkpoints", "").trim();
  const weaveRoot = persistRoot ? path.resolve(persistRoot) : "";
  const onCheckpoint =
    weaveRoot && checkpointEvery > 0
      ? (_commit: string, ser: string) => {
          persistCheckpointWeaveBlob(weaveRoot, ser);
        }
      : undefined;
  const { finalSerialized, checkpointCommits } = replaySteps(steps, {
    checkpointEvery,
    onCheckpoint,
  });
  const want = entry.weave_serialized_sha;
  const got = stateHash(finalSerialized);
  if (got !== want) {
    console.error(`weave replay: hash mismatch want=${want} got=${got}`);
    return 1;
  }

  const publish = shouldPublishCtRd(argv);
  const jsonOut = hasFlag(argv, "--json") || hasFlag(argv, "-j");

  if (publish) {
    const { hubWeaveOffline, buildCtRdDocument, publishCtRdToHub } = await import("@mergetonic/hf-weave");
    if (hubWeaveOffline()) {
      console.error(
        "weave replay: --publish-ctrd / TONIC_WEAVE_PUBLISH_CTRD requires Hub online (unset HF_HUB_OFFLINE)",
      );
      return 1;
    }
    const rid = resolveHubRepoIdForWeave(repo, getArg(argv, "--repo-id", ""));
    if (!rid) {
      console.error("weave replay: publish_ctrd needs hub_repo_id or TONIC_HF_WEAVE_REPO");
      return 1;
    }
    const stepDicts = steps.map((s) => ({ commit: s.commit, lines: [...s.lines] }));
    const de = entry.diff_engine_id?.trim() || "tonic-v1";
    const wfv = entry.weave_format_version?.trim() || "1";
    const { doc, ctrdId } = buildCtRdDocument({
      manifestCommit: String(manifest.commit ?? ""),
      path: logicalPath,
      steps: stepDicts,
      diffEngineId: de,
      weaveFormatVersion: wfv,
      expectedWeaveSerializedSha: want,
    });
    const cid = await publishCtRdToHub(rid, doc);
    const paths = { ...manifest.paths };
    const prev = paths[logicalPath]!;
    paths[logicalPath] = { ...prev, replay_trace_key: cid };
    const head = gitHeadSha(repo);
    const m2 = {
      ...manifest,
      paths,
      commit: head ?? manifest.commit ?? "0".repeat(40),
    };
    fs.writeFileSync(mpath, serializeManifestJson(m2), "utf8");
    if (jsonOut) {
      console.log(
        JSON.stringify({ ok: true, checkpoints: checkpointCommits, weave_serialized_sha: got, ctrd_id: ctrdId }, null, 2),
      );
    } else {
      console.log("replay ok", got, "published ctrd", `${cid.slice(0, 12)}…`);
    }
    return 0;
  }

  if (jsonOut) {
    console.log(JSON.stringify({ ok: true, checkpoints: checkpointCommits, weave_serialized_sha: got }, null, 2));
  } else {
    console.log("replay ok", got);
  }
  return 0;
}

function buildReplayArgvForSync(syncArgv: string[], repo: string, replayPath: string, includePublish: boolean): string[] {
  const out: string[] = ["replay", "--repo", repo, "--path", replayPath];
  const m = getArg(syncArgv, "--manifest", getArg(syncArgv, "-m", ""));
  if (m.trim()) {
    out.push("--manifest", m);
  }
  const sj = getArg(syncArgv, "--steps-json", "");
  if (sj.trim()) {
    out.push("--steps-json", sj);
  }
  const tk = getArg(syncArgv, "--trace-key", "");
  if (tk.trim()) {
    out.push("--trace-key", tk);
  }
  if (hasFlag(syncArgv, "--from-hub")) {
    out.push("--from-hub");
  }
  out.push("--checkpoint-every", getArg(syncArgv, "--checkpoint-every", "0"));
  const pc = getArg(syncArgv, "--persist-checkpoints", "");
  if (pc.trim()) {
    out.push("--persist-checkpoints", pc);
  }
  if (hasFlag(syncArgv, "--json") || hasFlag(syncArgv, "-j")) {
    out.push("--json");
  }
  const ridArg = getArg(syncArgv, "--repo-id", "");
  if (ridArg.trim()) {
    out.push("--repo-id", ridArg);
  }
  if (includePublish) {
    out.push("--publish-ctrd");
  }
  return out;
}

/** Optional mocks for tests (assert Hub call ordering without network). */
export type WeaveSyncInject = {
  hub?: {
    hubWeaveOffline: () => boolean;
    hubPushLocalWeaveBlobs: (p: { weaveBlobsDir: string; repoId: string }) => Promise<number>;
    refreshWeaveHubIndex: (p: { repoRoot: string; repoId: string }) => Promise<Record<string, unknown>>;
  };
  runReplay?: (replayArgv: string[]) => Promise<number>;
};

export async function runWeaveSyncFromArgv(
  argv: string[],
  repo: string,
  inject: WeaveSyncInject | undefined,
): Promise<number> {
  const dry = hasFlag(argv, "--dry-run");
  const noPush = hasFlag(argv, "--no-push-blobs");
  const updateIndex = hasFlag(argv, "--update-index");
  const publish = hasFlag(argv, "--publish-ctrd");
  const replayPath = getArg(argv, "--replay-path", getArg(argv, "-p", "")).trim();
  const rid = resolveHubRepoIdForWeave(repo, getArg(argv, "--repo-id", ""));
  const hubMod = inject?.hub ?? (await import("@mergetonic/hf-weave"));
  const { hubWeaveOffline, hubPushLocalWeaveBlobs, refreshWeaveHubIndex } = hubMod;

  if (publish) {
    if (!replayPath) {
      console.error("weave sync: --publish-ctrd requires --replay-path / -p");
      return 1;
    }
    const savedPublish = process.env.TONIC_WEAVE_PUBLISH_CTRD;
    if (dry) {
      delete process.env.TONIC_WEAVE_PUBLISH_CTRD;
    }
    const replayArgv = buildReplayArgvForSync(argv, repo, replayPath, !dry);
    const runRep = inject?.runReplay ?? runWeaveReplayFromArgv;
    const code = await runRep(replayArgv);
    if (dry) {
      if (savedPublish !== undefined) {
        process.env.TONIC_WEAVE_PUBLISH_CTRD = savedPublish;
      } else {
        delete process.env.TONIC_WEAVE_PUBLISH_CTRD;
      }
    }
    if (code !== 0) {
      return code;
    }
    if (dry) {
      console.log("weave sync: dry-run — would publish CTRD and update manifest");
    }
  } else if (dry) {
    console.log("weave sync: dry-run — skip replay/publish (no --publish-ctrd)");
  }

  if (!noPush) {
    if (dry) {
      console.log("weave sync: dry-run — would upload weave blobs");
    } else {
      if (!rid && !hubWeaveOffline()) {
        console.error("weave sync: missing repo id for blob push");
        return 1;
      }
      const blobsDir = path.join(repo, ".tonic", "weave", "blobs");
      try {
        const n = await hubPushLocalWeaveBlobs({ weaveBlobsDir: blobsDir, repoId: rid });
        console.error(`weave sync: pushed ${n} blob(s)`);
      } catch (e) {
        if (isHubWriteAuthError(e)) {
          console.error(
            "weave sync: Hub blob push failed (missing HF_TOKEN). Set HF_TOKEN or use HF_HUB_OFFLINE=1 to skip uploads.",
          );
          return 1;
        }
        throw e;
      }
    }
  } else if (dry) {
    console.log("weave sync: dry-run — skipped blob push (--no-push-blobs)");
  }

  if (updateIndex) {
    if (dry) {
      console.log("weave sync: dry-run — would refresh Hub weave index");
    } else {
      if (!rid && !hubWeaveOffline()) {
        console.error("weave sync: missing repo id for --update-index");
        return 1;
      }
      try {
        await refreshWeaveHubIndex({ repoRoot: repo, repoId: rid });
      } catch (e) {
        if (isHubWriteAuthError(e)) {
          console.error(
            "weave sync: Hub index upload failed (missing HF_TOKEN); local .tonic/hub/weave-index.v1.json was updated on disk.",
          );
          return 1;
        }
        throw e;
      }
    }
  }

  if (!dry) {
    if (hasFlag(argv, "--git-stage")) {
      gitAddWeavePaths(repo);
    }
    const msg = getArg(argv, "--git-commit-message", "").trim();
    if (msg) {
      if (gitCommitStaged(repo, msg) !== 0) {
        return 1;
      }
    }
  }

  return 0;
}
