"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setLastImportedArtifact = setLastImportedArtifact;
exports.getLastImportedContext = getLastImportedContext;
let lastReport;
let lastArtifact;
function setLastImportedArtifact(report, artifact) {
    lastReport = report;
    lastArtifact = artifact;
}
function getLastImportedContext() {
    if (!lastReport || !lastArtifact) {
        return undefined;
    }
    return { report: lastReport, artifact: lastArtifact };
}
