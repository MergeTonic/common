import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { parseTonicConflicts } from "@mergetonic/core";
import { getLastImportedContext } from "./importContext";
import {
  CHAT_OUTPUT_JSON_INSTRUCTIONS,
  ENHANCED_SYSTEM_PROMPT,
  buildHydratedConflictPrompt,
  type PromptContextFormat,
} from "./promptTemplates";
import { applyResolvedLines } from "./commands/resolveActions";
import { parseAgentResult } from "./agentContract";

type AgentProvider = "clipboard" | "cursor" | "copilot" | "customCli";

function providerToContextFormat(provider: AgentProvider): PromptContextFormat {
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

function buildFullPrompt(
  editor: vscode.TextEditor,
  provider: AgentProvider,
  startLine?: number,
): { prompt: string; line: number } {
  const blocks = parseTonicConflicts(editor.document.getText());
  const b = blocks.find((x) => x.startLine === startLine) ?? blocks[0];
  if (!b) {
    throw new Error("No Tonic conflict block found.");
  }
  const wsRel = vscode.workspace.asRelativePath(editor.document.uri, false);
  const leftHunk = b.segments[0]?.lines.join("\n") ?? "";
  const rightHunk = b.segments[1]?.lines.join("\n") ?? "";
  const ctx = getLastImportedContext();
  let reportMeta: string | undefined;
  if (ctx) {
    reportMeta = [
      `artifact.path=${ctx.artifact.path}`,
      `base_sha=${ctx.report.base_sha ?? ""}`,
      `head_sha=${ctx.report.head_sha ?? ""}`,
      `base_ref=${ctx.report.base_ref ?? ""}`,
      `head_ref=${ctx.report.head_ref ?? ""}`,
    ].join("\n");
  }
  const user = buildHydratedConflictPrompt({
    workspaceRelativePath: wsRel,
    conflictKind: b.kind,
    leftHunk,
    rightHunk,
    conflictStartLine: b.startLine + 1,
    conflictEndLine: b.endLine + 1,
    mergedReportMeta: reportMeta,
    contextFormat: providerToContextFormat(provider),
  });
  const full = `${ENHANCED_SYSTEM_PROMPT}\n\n${CHAT_OUTPUT_JSON_INSTRUCTIONS}\n\n${user}`;
  return { prompt: full, line: b.startLine };
}

async function runCustomCli(prompt: string): Promise<string> {
  const cfg = vscode.workspace.getConfiguration("tonic");
  const command = cfg.get<string>("agent.customCli.command", "").trim();
  const timeoutMs = cfg.get<number>("agent.customCli.timeoutMs", 30000);
  if (!command) {
    throw new Error("Set tonic.agent.customCli.command before using custom CLI provider.");
  }

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, {
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
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
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

export async function resolveWithProvider(editor: vscode.TextEditor, startLine?: number): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("tonic");
  const provider = (cfg.get<string>("agent.provider", "clipboard") as AgentProvider) ?? "clipboard";
  const { prompt, line } = buildFullPrompt(editor, provider, startLine);

  if (provider === "clipboard" || provider === "cursor" || provider === "copilot") {
    await vscode.env.clipboard.writeText(prompt);
    await vscode.window.showInformationMessage(
      "Tonic: hydrated prompt copied. Paste into your chat/agent and apply returned JSON.",
    );
    return;
  }

  if (provider === "customCli") {
    const raw = await runCustomCli(prompt);
    const parsed = parseAgentResult(raw);
    const applied = await applyResolvedLines(editor, line, parsed.resolved_lines);
    if (!applied) {
      throw new Error("Could not apply resolved_lines to conflict block.");
    }
    await vscode.window.showInformationMessage(
      parsed.rationale
        ? `Tonic: agent resolution applied. ${parsed.rationale}`
        : "Tonic: agent resolution applied.",
    );
    return;
  }

  throw new Error(`Unsupported tonic.agent.provider value: ${provider}`);
}
