import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function licenseAcceptancePath(): string {
  const home = os.homedir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "mergetonic", "license-accepted");
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdg, "mergetonic", "license-accepted");
}

export function isLicenseAccepted(): boolean {
  if (process.env.MERGETONIC_LICENSE_ACCEPTED === "1") {
    return true;
  }
  try {
    return fs.existsSync(licenseAcceptancePath());
  } catch {
    return false;
  }
}

export function writeLicenseAcceptance(): void {
  const p = licenseAcceptancePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "1\n", "utf8");
}

export const LICENSE_GATE_MESSAGE =
  "You must accept the GNU GPL-2.0-only license before using merge-tonic. Run: merge-tonic accept-license  (or set MERGETONIC_LICENSE_ACCEPTED=1 for automation).";

export function isHelpInvocation(argv: string[]): boolean {
  if (argv.length === 0) {
    return true;
  }
  const a0 = argv[0];
  if (a0 === "help" || a0 === "-h" || a0 === "--help") {
    return true;
  }
  return argv.includes("-h") || argv.includes("--help");
}
