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
exports.applyArtifactToWorkspace = applyArtifactToWorkspace;
const vscode = __importStar(require("vscode"));
const core_1 = require("@mergetonic/core");
function regionsJsonToCore(regions) {
    return (regions ?? []).map((r) => ({
        baseContent: r.base_content ?? "",
        leftContent: r.left_content ?? "",
        rightContent: r.right_content ?? "",
        startLine: r.start_line,
        endLine: r.end_line,
        conflictKind: r.conflict_kind,
    }));
}
function artifactBody(a) {
    if (a.annotated_lines?.length) {
        return a.annotated_lines.join("\n");
    }
    const regions = regionsJsonToCore(a.conflict_regions);
    if (regions.length) {
        return (0, core_1.conflictRegionsToAnnotatedLines)(regions).join("\n");
    }
    return null;
}
/**
 * Write Tonic marker text for one artifact to `workspaceFolder/artifact.path`.
 */
async function applyArtifactToWorkspace(_report, artifact) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        await vscode.window.showErrorMessage("Tonic: open a folder in the workspace first.");
        return;
    }
    const body = artifactBody(artifact);
    if (body == null) {
        await vscode.window.showErrorMessage("Tonic: no annotated_lines or conflict_regions to write for this file.");
        return;
    }
    const target = vscode.Uri.joinPath(folder.uri, artifact.path.replace(/\\/g, "/"));
    const pick = await vscode.window.showWarningMessage(`Tonic: overwrite workspace file?\n${vscode.workspace.asRelativePath(target)}`, { modal: true }, "Write file", "Cancel");
    if (pick !== "Write file") {
        return;
    }
    try {
        await vscode.workspace.fs.stat(target);
        const norm = artifact.path.replace(/\\/g, "/").split("/");
        const fileName = norm.pop() ?? "file";
        const bakName = `${fileName}.tonic.bak`;
        const bak = norm.length > 0
            ? vscode.Uri.joinPath(folder.uri, ...norm, bakName)
            : vscode.Uri.joinPath(folder.uri, bakName);
        const prev = await vscode.workspace.fs.readFile(target);
        await vscode.workspace.fs.writeFile(bak, prev);
    }
    catch {
        /* file may not exist */
    }
    await vscode.workspace.fs.writeFile(target, Buffer.from(body, "utf8"));
    await vscode.window.showInformationMessage(`Tonic: wrote markers to ${artifact.path}. Open the file to use CodeLens / decorations.`);
    const doc = await vscode.workspace.openTextDocument(target);
    await vscode.window.showTextDocument(doc);
}
