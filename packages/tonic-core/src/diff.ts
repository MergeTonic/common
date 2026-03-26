import { SequenceMatcher } from "./sequenceMatcher";

/** Returns ([deleted_line_number], [(insert_position, [inserted_line])]) — matches Python get_deletions_and_insertions */
export function getDeletionsAndInsertions(
  lines1: string[],
  lines2: string[],
): [number[], [number, string[]][]] {
  const deletions: number[] = [];
  const insertions: [number, string[]][] = [];
  const sm = new SequenceMatcher<string>(null, lines1, lines2);
  for (const row of sm.getOpcodes()) {
    const [tag, l1_begin, l1_end, l2_begin, l2_end] = row;
    if (tag === "delete" || tag === "replace") {
      for (let i = l1_begin; i < l1_end; i++) {
        deletions.push(i);
      }
    }
    if (tag === "insert" || tag === "replace") {
      insertions.push([l1_begin, lines2.slice(l2_begin, l2_end)]);
    }
  }
  return [deletions, insertions];
}
