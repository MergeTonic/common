import { EXIT_OK, EXIT_PARTIAL } from "../astGrep/types";

export type ConflictGateOutcomeV1 = {
  policy: string;
  conflict_region_count: number;
  action: "continue" | "stop";
  stop_reason?: string;
};

/**
 * Evaluate conflicts-first gate after scan.
 * - `TONIC_SKIP_CONFLICT_GATE=1` — always continue.
 * - `TONIC_CONFLICT_GATE=zero_stop` — exit early (partial) when there are zero conflict regions.
 * - Default — continue (structure-only / clean-tree friendly).
 */
export function evaluateConflictGate(
  env: NodeJS.ProcessEnv,
  conflictRegionCount: number,
): { outcome: ConflictGateOutcomeV1; shouldStop: boolean; exitCode: number } {
  if ((env.TONIC_SKIP_CONFLICT_GATE ?? "").trim() === "1") {
    return {
      outcome: {
        policy: "skipped",
        conflict_region_count: conflictRegionCount,
        action: "continue",
        stop_reason: "TONIC_SKIP_CONFLICT_GATE=1",
      },
      shouldStop: false,
      exitCode: EXIT_OK,
    };
  }

  const policy = (env.TONIC_CONFLICT_GATE ?? "").trim().toLowerCase();
  if (policy === "zero_stop" && conflictRegionCount === 0) {
    return {
      outcome: {
        policy: "zero_stop",
        conflict_region_count: 0,
        action: "stop",
        stop_reason: "zero conflict regions under TONIC_CONFLICT_GATE=zero_stop",
      },
      shouldStop: true,
      exitCode: EXIT_PARTIAL,
    };
  }

  return {
    outcome: {
      policy: policy || "default",
      conflict_region_count: conflictRegionCount,
      action: "continue",
    },
    shouldStop: false,
    exitCode: EXIT_OK,
  };
}
