"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const promptTemplates_1 = require("../promptTemplates");
(0, node_test_1.default)("buildHydratedConflictPrompt includes Cursor @file context when requested", () => {
    const prompt = (0, promptTemplates_1.buildHydratedConflictPrompt)({
        workspaceRelativePath: "src/main.ts",
        conflictKind: "added both",
        leftHunk: "left",
        rightHunk: "right",
        contextFormat: "cursor",
    });
    strict_1.default.match(prompt, /Context file \(Cursor\): @src\/main\.ts/);
    strict_1.default.doesNotMatch(prompt, /Context file \(VS Code\): #src\/main\.ts/);
});
(0, node_test_1.default)("buildHydratedConflictPrompt includes VS Code #file context when requested", () => {
    const prompt = (0, promptTemplates_1.buildHydratedConflictPrompt)({
        workspaceRelativePath: "src/main.ts",
        conflictKind: "added both",
        leftHunk: "left",
        rightHunk: "right",
        contextFormat: "vscode",
    });
    strict_1.default.match(prompt, /Context file \(VS Code\): #src\/main\.ts/);
    strict_1.default.doesNotMatch(prompt, /Context file \(Cursor\): @src\/main\.ts/);
});
(0, node_test_1.default)("buildHydratedConflictPrompt includes both context forms and line range", () => {
    const prompt = (0, promptTemplates_1.buildHydratedConflictPrompt)({
        workspaceRelativePath: "src/main.ts",
        conflictKind: "added both",
        leftHunk: "left",
        rightHunk: "right",
        contextFormat: "both",
        conflictStartLine: 10,
        conflictEndLine: 22,
    });
    strict_1.default.match(prompt, /Context file \(Cursor\): @src\/main\.ts/);
    strict_1.default.match(prompt, /Context file \(VS Code\): #src\/main\.ts/);
    strict_1.default.match(prompt, /Conflict range \(1-based lines\): 10-22/);
});
