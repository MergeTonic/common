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
exports.collectTonicDiagnostics = collectTonicDiagnostics;
exports.registerTonicDiagnostics = registerTonicDiagnostics;
const vscode = __importStar(require("vscode"));
const core_1 = require("@mergetonic/core");
function lineFromWarning(w) {
    const m = w.match(/line (\d+)/);
    if (m) {
        return Math.max(0, parseInt(m[1], 10) - 1);
    }
    return 0;
}
function collectTonicDiagnostics(text) {
    const out = [];
    if (text.includes("<<<<<<< begin ")) {
        const { warnings } = (0, core_1.parseTonicConflictsWithDiagnostics)(text);
        for (const w of warnings) {
            const ln = lineFromWarning(w);
            out.push(new vscode.Diagnostic(new vscode.Range(ln, 0, ln, 0), w, vscode.DiagnosticSeverity.Warning));
        }
    }
    if ((0, core_1.hasGitConflictMarkers)(text)) {
        const { warnings } = (0, core_1.parseGitConflictsWithDiagnostics)(text);
        for (const w of warnings) {
            const ln = lineFromWarning(w);
            out.push(new vscode.Diagnostic(new vscode.Range(ln, 0, ln, 0), `Git conflict: ${w}`, vscode.DiagnosticSeverity.Information));
        }
    }
    return out;
}
function registerTonicDiagnostics(context) {
    const coll = vscode.languages.createDiagnosticCollection("tonic");
    const refresh = (doc) => {
        if (!doc || doc.uri.scheme !== "file") {
            return;
        }
        const t = doc.getText();
        if (!t.includes("<<<<<<< ") && !(0, core_1.hasGitConflictMarkers)(t)) {
            coll.delete(doc.uri);
            return;
        }
        coll.set(doc.uri, collectTonicDiagnostics(t));
    };
    context.subscriptions.push(coll);
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((d) => refresh(d)));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => refresh(e.document)));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((ed) => refresh(ed?.document)));
    refresh(vscode.window.activeTextEditor?.document);
    return coll;
}
