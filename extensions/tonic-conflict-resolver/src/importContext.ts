import type { MergeArtifactJson, MergeReportJson } from "./mergeReport";

let lastReport: MergeReportJson | undefined;
let lastArtifact: MergeArtifactJson | undefined;

export function setLastImportedArtifact(report: MergeReportJson, artifact: MergeArtifactJson): void {
  lastReport = report;
  lastArtifact = artifact;
}

export function getLastImportedContext():
  | { report: MergeReportJson; artifact: MergeArtifactJson }
  | undefined {
  if (!lastReport || !lastArtifact) {
    return undefined;
  }
  return { report: lastReport, artifact: lastArtifact };
}
