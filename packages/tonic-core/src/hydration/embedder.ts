import { createHash } from "node:crypto";

export interface Embedder {
  readonly modelId: string;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

function deterministicEmbedding(text: string, dimensions: number): number[] {
  const hash = createHash("sha256").update(text, "utf8").digest();
  const values = new Array<number>(dimensions).fill(0);
  for (let i = 0; i < dimensions; i++) {
    const a = hash[i % hash.length] ?? 0;
    const b = hash[(i + 7) % hash.length] ?? 0;
    values[i] = (a + b) / 255 - 1;
  }
  return values;
}

export class DeterministicFakeEmbedder implements Embedder {
  readonly modelId: string;
  readonly dimensions: number;

  constructor(params: { modelId?: string; dimensions?: number } = {}) {
    this.modelId = params.modelId ?? "deterministic-fake-v1";
    this.dimensions = params.dimensions ?? 16;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => deterministicEmbedding(text, this.dimensions));
  }

  async embedQuery(text: string): Promise<number[]> {
    return deterministicEmbedding(text, this.dimensions);
  }
}
