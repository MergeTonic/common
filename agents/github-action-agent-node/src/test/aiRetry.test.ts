import test from "node:test";
import assert from "node:assert/strict";
import { isRetryableMessage, calculateBackoffTime, type RetryConfig } from "../aiRetry";

test("isRetryableMessage detects 429 and connection", () => {
  assert.equal(isRetryableMessage("OpenAI HTTP 429: ..."), true);
  assert.equal(isRetryableMessage("connection reset"), true);
  assert.equal(isRetryableMessage("bad gateway 400"), false);
});

test("calculateBackoffTime is non-negative", () => {
  const cfg: RetryConfig = {
    maxRetries: 3,
    initialBackoffMs: 100,
    maxBackoffMs: 1000,
    backoffMultiplier: 2,
    jitterFactor: 0,
  };
  for (let i = 0; i < 5; i++) {
    assert.ok(calculateBackoffTime(cfg, i) >= 0);
  }
});
