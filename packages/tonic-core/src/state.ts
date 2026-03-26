/** state row: line, depth, anchored_right, count */

export type StateRow = [string, number, boolean, number, string[]];

export function serializeState(state: StateRow[]): string {
  const parts: string[] = [];
  for (const [line, depth, anchored_right, count, provenance] of state) {
    parts.push(`${depth} ${anchored_right ? ">" : "<"} ${count} [${provenance.join(",")}] ${line}`);
  }
  return parts.join("\n");
}

export function deserializeState(mystr: string): StateRow[] {
  if (mystr === "") {
    return [];
  }
  const result: StateRow[] = [];
  for (const line of mystr.split("\n")) {
    const vals = line.split(" ");
    const hasProv = vals[3]?.startsWith("[") && vals[3]?.endsWith("]");
    const provenance = hasProv
      ? vals[3]!
          .slice(1, -1)
          .split(",")
          .filter((x) => x.length > 0)
      : [];
    result.push([
      vals.slice(hasProv ? 4 : 3).join(" "),
      parseInt(vals[0]!, 10),
      vals[1] === ">",
      parseInt(vals[2]!, 10),
      provenance,
    ]);
  }
  return result;
}
