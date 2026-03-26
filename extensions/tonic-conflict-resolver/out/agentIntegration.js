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
exports.resolveWithProvider = resolveWithProvider;
const vscode = __importStar(require("vscode"));
const node_child_process_1 = require("node:child_process");
const core_1 = require("@mergetonic/core");
const importContext_1 = require("./importContext");
const promptTemplates_1 = require("./promptTemplates");
const resolveActions_1 = require("./commands/resolveActions");
const agentContract_1 = require("./agentContract");
function providerToContextFormat(provider) {
    switch (provider) {
        case "cursor":
            return "cursor";
        case "copilot":
            return "vscode";
        case "clipboard":
            return "both";
        case "customCli":
            return "none";
        default:
            return "none";
    }
}
function buildFullPrompt(editor, provider, startLine) {
    const blocks = (0, core_1.parseTonicConflicts)(editor.document.getText());
    const b = blocks.find((x) => x.startLine === startLine) ?? blocks[0];
    if (!b) {
        throw new Error("No Tonic conflict block found.");
    }
    const wsRel = vscode.workspace.asRelativePath(editor.document.uri, false);
    const leftHunk = b.segments[0]?.lines.join("\n") ?? "";
    const rightHunk = b.segments[1]?.lines.join("\n") ?? "";
    const ctx = (0, importContext_1.getLastImportedContext)();
    let reportMeta;
    if (ctx) {
        reportMeta = [
            `artifact.path=${ctx.artifact.path}`,
            `base_sha=${ctx.report.base_sha ?? ""}`,
            `head_sha=${ctx.report.head_sha ?? ""}`,
            `base_ref=${ctx.report.base_ref ?? ""}`,
            `head_ref=${ctx.report.head_ref ?? ""}`,
        ].join("\n");
    }
    const user = (0, promptTemplates_1.buildHydratedConflictPrompt)({
        workspaceRelativePath: wsRel,
        conflictKind: b.kind,
        leftHunk,
        rightHunk,
        conflictStartLine: b.startLine + 1,
        conflictEndLine: b.endLine + 1,
        mergedReportMeta: reportMeta,
        contextFormat: providerToContextFormat(provider),
    });
    const full = `${promptTemplates_1.ENHANCED_SYSTEM_PROMPT}\n\n${promptTemplates_1.CHAT_OUTPUT_JSON_INSTRUCTIONS}\n\n${user}`;
    return { prompt: full, line: b.startLine };
}
async function runCustomCli(prompt) {
    const cfg = vscode.workspace.getConfiguration("tonic");
    const command = cfg.get("agent.customCli.command", "").trim();
    const timeoutMs = cfg.get("agent.customCli.timeoutMs", 30000);
    if (!command) {
        throw new Error("Set tonic.agent.customCli.command before using custom CLI provider.");
    }
    return await new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(command, {
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            shell: true,
            stdio: "pipe",
        });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error(`Agent CLI timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
        });
        child.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (code !== 0) {
                reject(new Error(stderr.trim() || `Agent CLI exited with code ${code}.`));
                return;
            }
            resolve(stdout.trim());
        });
        child.stdin.write(prompt);
        child.stdin.end();
    });
}
async function resolveWithProvider(editor, startLine) {
    const cfg = vscode.workspace.getConfiguration("tonic");
    const provider = cfg.get("agent.provider", "clipboard") ?? "clipboard";
    const { prompt, line } = buildFullPrompt(editor, provider, startLine);
    if (provider === "clipboard" || provider === "cursor" || provider === "copilot") {
        await vscode.env.clipboard.writeText(prompt);
        await vscode.window.showInformationMessage("Tonic: hydrated prompt copied. Paste into your chat/agent and apply returned JSON.");
        return;
    }
    if (provider === "customCli") {
        const raw = await runCustomCli(prompt);
        const parsed = (0, agentContract_1.parseAgentResult)(raw);
        const applied = await (0, resolveActions_1.applyResolvedLines)(editor, line, parsed.resolved_lines);
        if (!applied) {
            throw new Error("Could not apply resolved_lines to conflict block.");
        }
        await vscode.window.showInformationMessage(parsed.rationale
            ? `Tonic: agent resolution applied. ${parsed.rationale}`
            : "Tonic: agent resolution applied.");
        return;
    }
    throw new Error(`Unsupported tonic.agent.provider value: ${provider}`);
}
