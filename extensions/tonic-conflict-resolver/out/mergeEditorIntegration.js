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
exports.openInMergeEditor = openInMergeEditor;
const vscode = __importStar(require("vscode"));
/**
 * When the merge editor is active, try to open the same resource in merge mode.
 * VS Code exposes limited API for merge editors; this is a best-effort hook.
 */
async function openInMergeEditor(uri) {
    const mergeCommand = "merge.mergeEditor.openFromResource";
    const available = await vscode.commands.getCommands(true);
    if (!available.includes(mergeCommand)) {
        const pick = await vscode.window.showInformationMessage("Merge editor command is unavailable in this workspace. Open file and jump to next Tonic conflict?", "Open file", "Open + Next conflict");
        await vscode.window.showTextDocument(uri);
        if (pick === "Open + Next conflict") {
            await vscode.commands.executeCommand("tonic.jumpNextConflict");
        }
        return;
    }
    try {
        await vscode.commands.executeCommand(mergeCommand, uri);
    }
    catch {
        const pick = await vscode.window.showInformationMessage("Could not open merge editor for this file. Open file and jump to next Tonic conflict?", "Open file", "Open + Next conflict");
        await vscode.window.showTextDocument(uri);
        if (pick === "Open + Next conflict") {
            await vscode.commands.executeCommand("tonic.jumpNextConflict");
        }
    }
}
