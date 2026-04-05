import { hubWeaveOffline } from "./hubOffline";

/**
 * Stable substring for tests and CLI: Hub write paths require `HF_TOKEN` when not offline.
 */
export const HF_WEAVE_HUB_TOKEN_REQUIRED_CODE = "TONIC_HF_WEAVE_HUB_TOKEN_REQUIRED";

/** Require `HF_TOKEN` for intentional Hub mutations when not in offline mode. */
export function requireHubWriteTokenUnlessOffline(): void {
  if (hubWeaveOffline()) {
    return;
  }
  const token = (process.env.HF_TOKEN ?? "").trim();
  if (!token) {
    throw new Error(
      `${HF_WEAVE_HUB_TOKEN_REQUIRED_CODE}: HF_TOKEN is required for Hub writes when not offline (set HF_HUB_OFFLINE=1 to skip)`,
    );
  }
}
