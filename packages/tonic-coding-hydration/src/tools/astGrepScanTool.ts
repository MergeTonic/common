/**
 * On-demand ast-grep is executed by @mergetonic/core / CLI (`sg scan`).
 * This helper documents the tool seam for a future agent loop port.
 */
export type AstGrepScanToolRequest = {
  ruleYaml: string;
  paths: string[];
};

export function describeAstGrepScanTool(_req: AstGrepScanToolRequest): string {
  return "Run merge-tonic ast-grep-hydrate or sg scan with --rule / --config; binary must be on PATH.";
}
