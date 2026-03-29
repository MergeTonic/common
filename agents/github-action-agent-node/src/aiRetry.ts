/** Mirrors `tonic_agent/retry.py` RetryConfig + retryable heuristic. */

import { envFloat, envU32 } from "./aiEnvConfig";

export type RetryConfig = {
  maxRetries: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
};

export function retryConfigFromEnv(): RetryConfig {
  return {
    maxRetries: envU32("TONIC_AGENT_MAX_RETRIES", "RIZZLER_MAX_RETRIES", 3),
    initialBackoffMs: envU32("TONIC_AGENT_INITIAL_BACKOFF_MS", "RIZZLER_INITIAL_BACKOFF_MS", 1000),
    maxBackoffMs: envU32("TONIC_AGENT_MAX_BACKOFF_MS", "RIZZLER_MAX_BACKOFF_MS", 30000),
    backoffMultiplier: envFloat("TONIC_AGENT_BACKOFF_MULTIPLIER", "RIZZLER_BACKOFF_MULTIPLIER", 2),
    jitterFactor: envFloat("TONIC_AGENT_JITTER_FACTOR", "RIZZLER_JITTER_FACTOR", 0.1),
  };
}

export function calculateBackoffTime(cfg: RetryConfig, retryAttempt: number): number {
  const base = cfg.initialBackoffMs * cfg.backoffMultiplier ** retryAttempt;
  const capped = Math.min(base, cfg.maxBackoffMs);
  const jitterRange = capped * cfg.jitterFactor;
  const jitter = Math.random() * jitterRange * 2 - jitterRange;
  return Math.max(0, (capped + jitter) / 1000);
}

export function isRetryableMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return [
    "connection",
    "timeout",
    "rate",
    "429",
    "503",
    "502",
    "request",
  ].some((x) => lower.includes(x));
}

export async function withRetries<T>(cfg: RetryConfig, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= cfg.maxRetries || !isRetryableMessage(msg)) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, calculateBackoffTime(cfg, attempt) * 1000));
    }
  }
  throw lastErr;
}
