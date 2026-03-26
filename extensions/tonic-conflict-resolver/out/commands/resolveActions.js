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
exports.keepLeft = keepLeft;
exports.keepRight = keepRight;
exports.keepBoth = keepBoth;
exports.applyResolvedLines = applyResolvedLines;
exports.replaceBlock = replaceBlock;
const vscode = __importStar(require("vscode"));
const core_1 = require("@mergetonic/core");
function findBlockAtLine(blocks, line) {
    return blocks.find((b) => b.startLine === line) ?? blocks[0];
}
async function keepLeft(editor, startLine) {
    const blocks = (0, core_1.parseTonicConflicts)(editor.document.getText());
    const b = findBlockAtLine(blocks, startLine);
    if (!b) {
        return;
    }
    const leftText = b.segments[0]?.lines.join("\n") ?? "";
    await replaceBlock(editor, b.startLine, b.endLine, leftText);
}
async function keepRight(editor, startLine) {
    const blocks = (0, core_1.parseTonicConflicts)(editor.document.getText());
    const b = findBlockAtLine(blocks, startLine);
    if (!b || b.segments.length < 2) {
        return;
    }
    const rightText = b.segments[1]?.lines.join("\n") ?? "";
    await replaceBlock(editor, b.startLine, b.endLine, rightText);
}
async function keepBoth(editor, startLine) {
    const blocks = (0, core_1.parseTonicConflicts)(editor.document.getText());
    const b = findBlockAtLine(blocks, startLine);
    if (!b) {
        return;
    }
    const parts = b.segments.map((s) => s.lines.join("\n")).filter(Boolean);
    await replaceBlock(editor, b.startLine, b.endLine, parts.join("\n"));
}
async function applyResolvedLines(editor, startLine, resolvedLines) {
    const blocks = (0, core_1.parseTonicConflicts)(editor.document.getText());
    const b = findBlockAtLine(blocks, startLine);
    if (!b) {
        return false;
    }
    await replaceBlock(editor, b.startLine, b.endLine, resolvedLines.join("\n"));
    return true;
}
async function replaceBlock(editor, startLine, endLine, newBody) {
    const start = new vscode.Position(startLine, 0);
    const end = new vscode.Position(endLine, editor.document.lineAt(endLine).text.length);
    const range = new vscode.Range(start, end);
    await editor.edit((eb) => eb.replace(range, newBody));
}
