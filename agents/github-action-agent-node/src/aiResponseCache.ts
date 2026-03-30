/**
 * Disk cache keyed like `tonic_agent/cache.py` (SHA-256 over UTF-8 parts joined with 0x1e).
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { ConflictFile, ConflictRegion } from "@mergetonic/core";

export type CachedAiResponse = {
  content: string;
  model: string;
};

function hashParts(...parts: string[]): string {
  const h = crypto.createHash("sha256");
  for (const p of parts) {
    h.update(p, "utf8");
    h.update(Buffer.from([0x1e]));
  }
  return h.digest("hex");
}

function expired(filePath: string, ttlSeconds: number): boolean {
  const st = fs.statSync(filePath);
  return Date.now() - st.mtimeMs > ttlSeconds * 1000;
}

export class DiskAiResolutionCache {
  constructor(
    readonly cacheDir: string,
    readonly ttlSeconds: number,
  ) {}

  save(key: string, r: CachedAiResponse): void {
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const filePath = path.join(this.cacheDir, `${key}.json`);
    const payload = { saved: Date.now() / 1000, response: r };
    fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
  }

  load(key: string): CachedAiResponse | null {
    const filePath = path.join(this.cacheDir, `${key}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    if (expired(filePath, this.ttlSeconds)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
      return null;
    }
    try {
      const payload = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
        response: CachedAiResponse;
      };
      return payload.response;
    } catch {
      return null;
    }
  }
}

export class AiResponseCacheFacade {
  constructor(
    private readonly inner: DiskAiResolutionCache,
    readonly enabled: boolean,
  ) {}

  static fromEnv(
    enabled: boolean,
    ttlHours: number,
    cacheDir: string | undefined,
    cwd: string,
  ): AiResponseCacheFacade {
    const base = cacheDir?.trim() || path.join(cwd, ".tonic_agent_cache");
    const ttlSeconds = ttlHours * 3600;
    return new AiResponseCacheFacade(new DiskAiResolutionCache(base, ttlSeconds), enabled);
  }

  getConflict(
    model: string,
    conflictFile: ConflictFile,
    conflict: ConflictRegion,
    expectedResolvedLineCount?: number,
  ): CachedAiResponse | null {
    if (!this.enabled) {
      return null;
    }
    const key = hashParts(
      "conflict",
      model,
      conflictFile.path,
      String(conflict.startLine),
      String(conflict.endLine),
      expectedResolvedLineCount == null ? "" : String(expectedResolvedLineCount),
      conflict.leftContent ?? "",
      conflict.rightContent ?? "",
    );
    return this.inner.load(key);
  }

  putConflict(
    model: string,
    conflictFile: ConflictFile,
    conflict: ConflictRegion,
    r: CachedAiResponse,
    expectedResolvedLineCount?: number,
  ): void {
    if (!this.enabled) {
      return;
    }
    const key = hashParts(
      "conflict",
      model,
      conflictFile.path,
      String(conflict.startLine),
      String(conflict.endLine),
      expectedResolvedLineCount == null ? "" : String(expectedResolvedLineCount),
      conflict.leftContent ?? "",
      conflict.rightContent ?? "",
    );
    this.inner.save(key, r);
  }
}
