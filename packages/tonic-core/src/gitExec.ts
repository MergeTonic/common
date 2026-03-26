import { spawnSync } from "node:child_process";

export function gitExec(
  repoRoot: string,
  args: string[],
): { code: number | null; stdout: string; stderr: string } {
  const r = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

export function gitRequireOk(
  repoRoot: string,
  args: string[],
  errCtx: string,
): string {
  const { code, stdout, stderr } = gitExec(repoRoot, args);
  if (code !== 0) {
    throw new Error(`${errCtx}: git ${args.join(" ")}\n${stderr || stdout}`);
  }
  return stdout;
}
