import * as fs from "node:fs";
import * as path from "node:path";

import type { HydrationPipelineRun } from "./types";

export type HydrationLlmTranscriptEvent = {
  ts?: string;
  stage_id: string;
  event: string;
  provider?: string;
  model?: string;
  prompt_template?: string;
  request_json?: unknown;
  response_json?: unknown;
  note?: string;
};

function resolveTranscriptPath(run: HydrationPipelineRun): string {
  return run.artifacts.llm_transcript_path
    ?? path.join(path.dirname(run.artifacts.run_state_path), "llm.jsonl");
}

export function appendHydrationLlmTranscriptEvent(
  run: HydrationPipelineRun,
  event: HydrationLlmTranscriptEvent,
): string {
  const targetPath = resolveTranscriptPath(run);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const payload = {
    ts: event.ts ?? new Date().toISOString(),
    ...event,
  };
  fs.appendFileSync(targetPath, JSON.stringify(payload) + "\n", "utf8");
  run.artifacts.llm_transcript_path = targetPath;
  return targetPath;
}
