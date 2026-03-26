"use strict";
/**
 * JSON report emitted by mergetonic-github-agent (schemas/merge-tonic-report.schema.json).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMergeReportJson = parseMergeReportJson;
function parseMergeReportJson(text) {
    const raw = JSON.parse(text);
    if (typeof raw !== "object" || raw === null || !("files" in raw)) {
        throw new Error("Tonic report: missing top-level 'files' array");
    }
    const files = raw.files;
    if (!Array.isArray(files)) {
        throw new Error("Tonic report: 'files' must be an array");
    }
    return raw;
}
