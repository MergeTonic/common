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
exports.createDecorationTypes = createDecorationTypes;
exports.rangesForBlock = rangesForBlock;
exports.decorateDocument = decorateDocument;
const vscode = __importStar(require("vscode"));
const core_1 = require("@mergetonic/core");
const conflictLabelConfig_1 = require("./config/conflictLabelConfig");
function createDecorationTypes() {
    return {
        left: vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor("tonic.leftBackground"),
            isWholeLine: true,
        }),
        right: vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor("tonic.rightBackground"),
            isWholeLine: true,
        }),
        header: vscode.window.createTextEditorDecorationType({
            fontWeight: "bold",
        }),
    };
}
function lineOffsetToRange(lines, globalStartLine, segLines) {
    const ranges = [];
    let ln = globalStartLine;
    for (const _ of segLines) {
        ranges.push(new vscode.Range(ln, 0, ln, lines[ln]?.length ?? 0));
        ln += 1;
    }
    return ranges;
}
function rangesForBlock(doc, block) {
    const lines = doc.getText().split(/\r?\n/);
    const left = [];
    const right = [];
    const headers = [];
    headers.push(new vscode.Range(block.startLine, 0, block.startLine, lines[block.startLine]?.length ?? 0));
    let linePtr = block.startLine + 1;
    for (let s = 0; s < block.segments.length; s++) {
        const seg = block.segments[s];
        const useLeft = s % 2 === 0;
        const bucket = useLeft ? left : right;
        for (const _ of seg.lines) {
            if (linePtr < lines.length) {
                bucket.push(new vscode.Range(linePtr, 0, linePtr, lines[linePtr].length));
            }
            linePtr += 1;
        }
        if (s < block.segments.length - 1) {
            if (linePtr < lines.length && lines[linePtr].startsWith("======= begin ")) {
                headers.push(new vscode.Range(linePtr, 0, linePtr, lines[linePtr].length));
                linePtr += 1;
            }
        }
    }
    if (linePtr < lines.length && lines[linePtr].startsWith(">>>>>>> end conflict")) {
        headers.push(new vscode.Range(linePtr, 0, linePtr, lines[linePtr].length));
    }
    return { left, right, headers };
}
function decorateDocument(editor, types) {
    const doc = editor.document;
    const text = doc.getText();
    const blocks = (0, core_1.parseTonicConflicts)(text);
    const left = [];
    const right = [];
    const headers = [];
    for (const b of blocks) {
        const r = rangesForBlock(doc, b);
        left.push(...r.left);
        right.push(...r.right);
        headers.push(...r.headers);
    }
    const semanticLeft = collectSemanticRanges(doc, blocks, 0);
    const semanticRight = collectSemanticRanges(doc, blocks, 1);
    if (semanticLeft.size === 0 && semanticRight.size === 0) {
        editor.setDecorations(types.left, left);
        editor.setDecorations(types.right, right);
    }
    else {
        editor.setDecorations(types.left, []);
        editor.setDecorations(types.right, []);
        const merged = new Map();
        for (const [color, ranges] of [...semanticLeft.entries(), ...semanticRight.entries()]) {
            merged.set(color, [...(merged.get(color) ?? []), ...ranges]);
        }
        applySemanticDecorations(editor, merged);
    }
    editor.setDecorations(types.header, headers);
}
const dynamicDecorationTypes = [];
function collectSemanticRanges(doc, blocks, parity) {
    const byColor = new Map();
    for (const block of blocks) {
        const rangeSet = rangesForBlock(doc, block);
        const ranges = parity === 0 ? rangeSet.left : rangeSet.right;
        if (ranges.length === 0) {
            continue;
        }
        const segment = block.segments.find((_, idx) => idx % 2 === parity);
        const color = (0, conflictLabelConfig_1.semanticColorForLabel)(segment?.label ?? block.kind);
        if (!color) {
            continue;
        }
        byColor.set(color, [...(byColor.get(color) ?? []), ...ranges]);
    }
    return byColor;
}
function applySemanticDecorations(editor, byColor) {
    while (dynamicDecorationTypes.length > 0) {
        dynamicDecorationTypes.pop()?.dispose();
    }
    for (const [color, ranges] of byColor.entries()) {
        const type = vscode.window.createTextEditorDecorationType({
            backgroundColor: color,
            isWholeLine: true,
        });
        dynamicDecorationTypes.push(type);
        editor.setDecorations(type, ranges);
    }
}
