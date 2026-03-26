/**
 * Python difflib.SequenceMatcher port (CPython 3.12 subset: get_opcodes only).
 * Used so update_state matches @tonic's SequenceMatcher behavior.
 */

export type Match = { a: number; b: number; size: number };

type Opcode = ["replace" | "delete" | "insert" | "equal", number, number, number, number];

export class SequenceMatcher<T> {
  private isjunk: ((x: T) => boolean) | null;
  private autojunk: boolean;
  private a: T[] = [];
  private b: T[] = [];
  private b2j = new Map<T, number[]>();
  private bjunk = new Set<T>();
  private bpopular = new Set<T>();
  private fullbcount: Map<T, number> | null = null;
  private matchingBlocks: Match[] | null = null;
  private opcodes: Opcode[] | null = null;

  constructor(isjunk: ((x: T) => boolean) | null, a: T[], b: T[], autojunk = true) {
    this.isjunk = isjunk;
    this.autojunk = autojunk;
    this.setSeqs(a, b);
  }

  setSeqs(a: T[], b: T[]): void {
    this.setSeq1(a);
    this.setSeq2(b);
  }

  setSeq1(a: T[]): void {
    if (a === this.a) {
      return;
    }
    this.a = a;
    this.matchingBlocks = this.opcodes = null;
  }

  setSeq2(b: T[]): void {
    if (b === this.b) {
      return;
    }
    this.b = b;
    this.matchingBlocks = this.opcodes = null;
    this.fullbcount = null;
    this.chainB();
  }

  private chainB(): void {
    const b = this.b;
    const b2j = new Map<T, number[]>();

    for (let i = 0; i < b.length; i++) {
      const elt = b[i];
      let indices = b2j.get(elt);
      if (!indices) {
        indices = [];
        b2j.set(elt, indices);
      }
      indices.push(i);
    }

    const junk = new Set<T>();
    const isjunk = this.isjunk;
    if (isjunk) {
      for (const elt of b2j.keys()) {
        if (isjunk(elt)) {
          junk.add(elt);
        }
      }
      for (const elt of junk) {
        b2j.delete(elt);
      }
    }

    const popular = new Set<T>();
    const n = b.length;
    if (this.autojunk && n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      for (const [elt, idxs] of b2j) {
        if (idxs.length > ntest) {
          popular.add(elt);
        }
      }
      for (const elt of popular) {
        b2j.delete(elt);
      }
    }

    this.b2j = b2j;
    this.bjunk = junk;
    this.bpopular = popular;
  }

  findLongestMatch(alo: number, ahi?: number, blo?: number, bhi?: number): Match {
    const a = this.a;
    const b = this.b;
    const b2j = this.b2j;
    const isbjunk = (x: T) => this.bjunk.has(x);
    if (ahi === undefined) {
      ahi = a.length;
    }
    if (blo === undefined) {
      blo = 0;
    }
    if (bhi === undefined) {
      bhi = b.length;
    }

    let besti = alo;
    let bestj = blo;
    let bestsize = 0;

    let j2len = new Map<number, number>();
    const nothing: number[] = [];

    for (let i = alo; i < ahi; i++) {
      const j2lenget = (j: number) => j2len.get(j) ?? 0;
      const newj2len = new Map<number, number>();
      for (const j of b2j.get(a[i]) ?? nothing) {
        if (j < blo) {
          continue;
        }
        if (j >= bhi) {
          break;
        }
        const k = j2lenget(j - 1) + 1;
        newj2len.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = newj2len;
    }

    while (
      besti > alo &&
      bestj > blo &&
      !isbjunk(b[bestj - 1]) &&
      a[besti - 1] === b[bestj - 1]
    ) {
      besti -= 1;
      bestj -= 1;
      bestsize += 1;
    }
    while (
      besti + bestsize < ahi &&
      bestj + bestsize < bhi &&
      !isbjunk(b[bestj + bestsize]) &&
      a[besti + bestsize] === b[bestj + bestsize]
    ) {
      bestsize += 1;
    }

    while (
      besti > alo &&
      bestj > blo &&
      isbjunk(b[bestj - 1]) &&
      a[besti - 1] === b[bestj - 1]
    ) {
      besti -= 1;
      bestj -= 1;
      bestsize += 1;
    }
    while (
      besti + bestsize < ahi &&
      bestj + bestsize < bhi &&
      isbjunk(b[bestj + bestsize]) &&
      a[besti + bestsize] === b[bestj + bestsize]
    ) {
      bestsize += 1;
    }

    return { a: besti, b: bestj, size: bestsize };
  }

  getMatchingBlocks(): Match[] {
    if (this.matchingBlocks !== null) {
      return this.matchingBlocks;
    }
    const la = this.a.length;
    const lb = this.b.length;
    const queue: Array<[number, number, number, number]> = [[0, la, 0, lb]];
    const matchingBlocks: Match[] = [];

    while (queue.length > 0) {
      const item = queue.pop()!;
      const [alo, ahi, blo, bhi] = item;
      const { a: i, b: j, size: k } = this.findLongestMatch(alo, ahi, blo, bhi);
      if (k) {
        matchingBlocks.push({ a: i, b: j, size: k });
        if (alo < i && blo < j) {
          queue.push([alo, i, blo, j]);
        }
        if (i + k < ahi && j + k < bhi) {
          queue.push([i + k, ahi, j + k, bhi]);
        }
      }
    }

    matchingBlocks.sort((x, y) => (x.a !== y.a ? x.a - y.a : x.b - y.b));

    let i1 = 0;
    let j1 = 0;
    let k1 = 0;
    const nonAdjacent: Match[] = [];
    for (const { a: i2, b: j2, size: k2 } of matchingBlocks) {
      if (i1 + k1 === i2 && j1 + k1 === j2) {
        k1 += k2;
      } else {
        if (k1) {
          nonAdjacent.push({ a: i1, b: j1, size: k1 });
        }
        i1 = i2;
        j1 = j2;
        k1 = k2;
      }
    }
    if (k1) {
      nonAdjacent.push({ a: i1, b: j1, size: k1 });
    }

    nonAdjacent.push({ a: la, b: lb, size: 0 });
    this.matchingBlocks = nonAdjacent;
    return this.matchingBlocks;
  }

  getOpcodes(): Opcode[] {
    if (this.opcodes !== null) {
      return this.opcodes;
    }
    let i = 0;
    let j = 0;
    const answer: Opcode[] = [];
    for (const { a: ai, b: bj, size } of this.getMatchingBlocks()) {
      let tag: "replace" | "delete" | "insert" | "" = "";
      if (i < ai && j < bj) {
        tag = "replace";
      } else if (i < ai) {
        tag = "delete";
      } else if (j < bj) {
        tag = "insert";
      }
      if (tag) {
        answer.push([tag, i, ai, j, bj]);
      }
      i = ai + size;
      j = bj + size;
      if (size) {
        answer.push(["equal", ai, i, bj, j]);
      }
    }
    this.opcodes = answer;
    return this.opcodes;
  }
}
