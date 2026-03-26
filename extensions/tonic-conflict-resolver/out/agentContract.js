"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAgentResult = parseAgentResult;
function parseAgentResult(raw) {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Agent output must be a JSON object.");
    }
    const obj = parsed;
    if (!Array.isArray(obj.resolved_lines) || !obj.resolved_lines.every((x) => typeof x === "string")) {
        throw new Error("Agent output must include resolved_lines: string[].");
    }
    for (const ln of obj.resolved_lines) {
        if (ln.includes("\n") || ln.includes("\r")) {
            throw new Error("Each resolved_lines entry must be a single line.");
        }
    }
    return {
        resolved_lines: obj.resolved_lines,
        rationale: typeof obj.rationale === "string" ? obj.rationale : undefined,
    };
}
