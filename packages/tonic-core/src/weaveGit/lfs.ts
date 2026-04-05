import * as fs from "node:fs";
import * as path from "node:path";

const LFS_POINTER_PREFIX = Buffer.from("version https://git-lfs.github.com/spec/v1");

export function isLfsPointer(data: Buffer): boolean {
  return (
    data.length >= LFS_POINTER_PREFIX.length &&
    LFS_POINTER_PREFIX.equals(data.subarray(0, LFS_POINTER_PREFIX.length))
  );
}

/** List files under ``root`` whose first 64 bytes look like a Git LFS pointer. */
export function findLfsPointersUnder(root: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return out;
  }
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        let head: Buffer;
        try {
          const fd = fs.openSync(full, "r");
          const buf = Buffer.alloc(64);
          const n = fs.readSync(fd, buf, 0, 64, 0);
          fs.closeSync(fd);
          head = buf.subarray(0, n);
        } catch {
          continue;
        }
        if (isLfsPointer(head)) {
          out.push(full);
        }
      }
    }
  };
  walk(root);
  return out;
}
