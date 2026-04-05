"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAT_OUTPUT_JSON_INSTRUCTIONS = exports.CONTEXT_AWARE_SYSTEM_PROMPT = exports.ENHANCED_SYSTEM_PROMPT = exports.DEFAULT_SYSTEM_PROMPT = void 0;
exports.buildHydratedConflictPrompt = buildHydratedConflictPrompt;
/**
 * Optional parity with agent prompt templates: load canonical `prompts/conflict/*.md` via
 * `agents/shared-tonic-ai-prompts/prompts.v1.json` (repo root), with fallbacks if the file is missing.
 */
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const core_1 = require("@mergetonic/core");
function loadSharedPromptBundle() {
    try {
        const repoRoot = path.resolve(__dirname, "..", "..", "..");
        const p = path.join(repoRoot, "agents", "shared-tonic-ai-prompts", "prompts.v1.json");
        if (!fs.existsSync(p)) {
            return {};
        }
        return JSON.parse(fs.readFileSync(p, "utf8"));
    }
    catch {
        return {};
    }
}
const _bundle = loadSharedPromptBundle();
const _sp = _bundle.system_prompts ?? {};
exports.DEFAULT_SYSTEM_PROMPT = (_sp.default ?? "").trim() ||
    `You are an expert software developer helping to resolve merge conflicts
described with Tonic semantic markers. "Left" is the base branch version; "right" is the head (PR) version.
Conflict kinds include added left, added right, added both, deleted left, deleted right.`;
exports.ENHANCED_SYSTEM_PROMPT = (_sp.enhanced ?? "").trim() ||
    `You are an expert specializing in Tonic-style merge conflicts.
Interpret left (base) vs right (head) by meaning. Conflict kinds label how each side changed; resolve with semantic understanding.`;
exports.CONTEXT_AWARE_SYSTEM_PROMPT = (_sp.context_aware ?? "").trim() ||
    `You are an expert specializing in Tonic merge conflicts.
Compare left (base) and right (head); use BASE / surrounding file context when the user provides it.`;
/** Aligns with mergetonic-github-agent / parse_resolved_lines_from_ai JSON contract. */
exports.CHAT_OUTPUT_JSON_INSTRUCTIONS = (_bundle.github_json_response_suffix ?? "").trim() ||
    `You MUST respond with a single JSON object only, no markdown fences, using this shape: {"resolved_lines":["each output line"],"rationale":"one short sentence"}. Each resolved_lines entry is one logical line (no embedded newlines).`;
function contextMentions(path, format) {
    if (format === "cursor") {
        return [`Context file (Cursor): @${path}`];
    }
    if (format === "vscode") {
        return [`Context file (VS Code): #${path}`];
    }
    if (format === "both") {
        return [`Context file (Cursor): @${path}`, `Context file (VS Code): #${path}`];
    }
    return [];
}
function buildHydratedConflictPrompt(params) {
    const contextFormat = params.contextFormat ?? "none";
    const parts = [
        `File (workspace-relative): ${params.workspaceRelativePath}`,
        ...contextMentions(params.workspaceRelativePath, contextFormat),
        ...(typeof params.conflictStartLine === "number" && typeof params.conflictEndLine === "number"
            ? [`Conflict range (1-based lines): ${params.conflictStartLine}-${params.conflictEndLine}`]
            : []),
        `Conflict kind: ${params.conflictKind}`,
        ...(() => {
            const parsed = (0, core_1.parseConflictLabel)(params.conflictKind);
            const tags = Object.entries(parsed.tags).map(([k, v]) => `${k}=${v}`);
            return tags.length ? [`Conflict tags: ${tags.join(", ")}`] : [];
        })(),
        `--- Left (base) ---`,
        params.leftHunk || "(empty)",
        `--- Right (head) ---`,
        params.rightHunk || "(empty)",
    ];
    if (params.mergedReportMeta) {
        parts.push("--- CI merge report ---", params.mergedReportMeta);
    }
    parts.push("", "Propose merged lines that replace the entire Tonic conflict block (output must not include marker lines).");
    return parts.join("\n");
}
