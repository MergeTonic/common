import * as fs from "node:fs";
import * as path from "node:path";
import { updateState } from "../core";
import { sha256HexBytes } from "./hashutil";
import { parseManifestJson } from "./manifest";
import type { TonicGitManifest } from "./types";

export type ReplayStep = { commit: string; lines: string[] };

export function stateHash(stateSerialized: string): string {
  return sha256HexBytes(Buffer.from(stateSerialized, "utf8"));
}

export function persistCheckpointWeaveBlob(weaveRoot: string, serialized: string): string {
  const h = stateHash(serialized);
  const d = path.join(weaveRoot, "blobs");
  fs.mkdirSync(d, { recursive: true });
  const out = path.join(d, h);
  if (!fs.existsSync(out)) {
    fs.writeFileSync(out, serialized, "utf8");
  }
  return h;
}

export function replaySteps(
  steps: ReplayStep[],
  options: {
    startState?: string;
    checkpointEvery?: number;
    onCheckpoint?: (commit: string, serialized: string) => void;
  } = {},
): { finalSerialized: string; checkpointCommits: string[] } {
  let state = options.startState ?? "";
  const checkpointEvery = options.checkpointEvery ?? 0;
  const onCheckpoint = options.onCheckpoint;
  const checkpointCommits: string[] = [];
  for (let n = 0; n < steps.length; n++) {
    const step = steps[n]!;
    state = updateState(state, step.lines, step.commit);
    const stepNum = n + 1;
    if (checkpointEvery > 0 && stepNum % checkpointEvery === 0) {
      checkpointCommits.push(step.commit);
      onCheckpoint?.(step.commit, state);
    }
  }
  return { finalSerialized: state, checkpointCommits };
}

export function verifyReplayMatchesManifest(
  manifestJson: string,
  logicalPath: string,
  steps: ReplayStep[],
  checkpointEvery = 0,
): boolean {
  const data = parseManifestJson(manifestJson) as TonicGitManifest;
  const entry = data.paths[logicalPath];
  if (!entry || typeof entry.weave_serialized_sha !== "string") {
    return false;
  }
  const want = entry.weave_serialized_sha;
  const { finalSerialized } = replaySteps(steps, { checkpointEvery });
  return stateHash(finalSerialized) === want;
}
