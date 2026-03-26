import * as vscode from "vscode";
import {
  conflictRegionsToAnnotatedLines,
  gitConflictBlocksToTonicAnnotatedPreview,
  hasGitConflictMarkers,
  mergeSnapshots,
  parseGitConflicts,
  parseTonicConflicts,
  type ConflictRegion,
} from "@mergetonic/core";
import { applyArtifactToWorkspace } from "./commands/applyReportToWorkspace";
import { registerTonicDiagnostics } from "./diagnosticsProvider";
import { TonicCodeLensProvider } from "./codeLensProvider";
import { createDecorationTypes, decorateDocument } from "./decorations";
import { openInMergeEditor } from "./mergeEditorIntegration";
import { ConflictTreeProvider } from "./conflictTreeView";
import * as resolveActions from "./commands/resolveActions";
import { resolveWithProvider } from "./agentIntegration";
import { getLastImportedContext, setLastImportedArtifact } from "./importContext";
import type { ConflictRegionJson, MergeArtifactJson } from "./mergeReport";
import { parseMergeReportJson } from "./mergeReport";
import {
  CHAT_OUTPUT_JSON_INSTRUCTIONS,
  ENHANCED_SYSTEM_PROMPT,
  buildHydratedConflictPrompt,
} from "./promptTemplates";

function normalizeFileLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  return lines.length && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
}

async function pickOneFile(title: string): Promise<vscode.Uri | undefined> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: title,
  });
  return uris?.[0];
}

function regionsJsonToCore(regions: ConflictRegionJson[] | undefined): ConflictRegion[] {
  return (regions ?? []).map((r) => ({
    baseContent: r.base_content ?? "",
    leftContent: r.left_content ?? "",
    rightContent: r.right_content ?? "",
    startLine: r.start_line,
    endLine: r.end_line,
    conflictKind: r.conflict_kind,
  }));
}

function blameSummary(f: MergeArtifactJson): string {
  const left = f.left_commit_id ? f.left_commit_id.slice(0, 12) : "";
  const right = f.right_commit_id ? f.right_commit_id.slice(0, 12) : "";
  if (!left && !right) {
    return "";
  }
  return ` | blame ${left || "?"}/${right || "?"}`;
}

let decorationTypes: ReturnType<typeof createDecorationTypes> | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const tryOpenLastReportPath = async (): Promise<vscode.Uri | undefined> => {
    const last = context.workspaceState.get<string>("tonic.lastReportJsonPath");
    if (!last) {
      return undefined;
    }
    try {
      const uri = vscode.Uri.file(last);
      await vscode.workspace.fs.stat(uri);
      return uri;
    } catch {
      return undefined;
    }
  };
  decorationTypes = createDecorationTypes();
  registerTonicDiagnostics(context);
  const codeLens = new TonicCodeLensProvider();
  const tree = new ConflictTreeProvider();

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, codeLens)
  );
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("tonic.conflicts", tree)
  );

  const refresh = () => {
    const ed = vscode.window.activeTextEditor;
    if (ed && decorationTypes) {
      decorateDocument(ed, decorationTypes);
    }
    tree.setDocument(ed?.document);
    codeLens.refresh();
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => refresh())
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) {
        refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tonic.keepLeft", async (line?: number) => {
      const ed = vscode.window.activeTextEditor;
      if (ed) {
        await resolveActions.keepLeft(ed, line ?? ed.selection.active.line);
        refresh();
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("tonic.keepRight", async (line?: number) => {
      const ed = vscode.window.activeTextEditor;
      if (ed) {
        await resolveActions.keepRight(ed, line ?? ed.selection.active.line);
        refresh();
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("tonic.keepBoth", async (line?: number) => {
      const ed = vscode.window.activeTextEditor;
      if (ed) {
        await resolveActions.keepBoth(ed, line ?? ed.selection.active.line);
        refresh();
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("tonic.acceptDeterministic", async () => {
      const leftUri = await pickOneFile("Left snapshot");
      if (!leftUri) {
        return;
      }
      const rightUri = await pickOneFile("Right snapshot");
      if (!rightUri) {
        return;
      }
      const leftBuf = await vscode.workspace.fs.readFile(leftUri);
      const rightBuf = await vscode.workspace.fs.readFile(rightUri);
      const left = normalizeFileLines(Buffer.from(leftBuf).toString("utf8"));
      const right = normalizeFileLines(Buffer.from(rightBuf).toString("utf8"));
      const [, annotated] = mergeSnapshots(left, right);
      const doc = await vscode.workspace.openTextDocument({
        content: annotated.join("\n"),
        language: "plaintext",
      });
      await vscode.window.showTextDocument(doc, { preview: false });
      await vscode.window.showInformationMessage(
        "Tonic: deterministic merge (from @mergetonic/core) opened as a new document with markers."
      );
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("tonic.openMergeEditor", async () => {
      const ed = vscode.window.activeTextEditor;
      if (ed) {
        await openInMergeEditor(ed.document.uri);
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("tonic.resolveWithAgent", async (line?: number) => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) {
        return;
      }
      try {
        await resolveWithProvider(ed, line ?? ed.selection.active.line);
        refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`Tonic agent resolve failed: ${msg}`);
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("tonic.resolveWithAI", async (line?: number) => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) {
        return;
      }
      const blocks = parseTonicConflicts(ed.document.getText());
      const b = blocks.find((x) => x.startLine === line) ?? blocks[0];
      if (!b) {
        await vscode.window.showInformationMessage("Tonic: no conflict block found.");
        return;
      }
      const wsRel = vscode.workspace.asRelativePath(ed.document.uri, false);
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
        contextFormat: "both",
      });
      const full = `${ENHANCED_SYSTEM_PROMPT}\n\n${CHAT_OUTPUT_JSON_INSTRUCTIONS}\n\n${user}`;
      await vscode.env.clipboard.writeText(full);
      await vscode.window.showInformationMessage(
        "Tonic: hydrated prompt copied — paste into Cursor / VS Code Chat (JSON output matches agent contract).",
      );
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("tonic.jumpNextConflict", () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) {
        return;
      }
      const blocks = parseTonicConflicts(ed.document.getText());
      const cur = ed.selection.active.line;
      const next = blocks.find((b) => b.startLine > cur) ?? blocks[0];
      if (next) {
        const pos = new vscode.Position(next.startLine, 0);
        ed.selection = new vscode.Selection(pos, pos);
        ed.revealRange(new vscode.Range(pos, pos));
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("tonic.jumpToLine", (ln: number) => {
      const ed = vscode.window.activeTextEditor;
      if (ed) {
        const pos = new vscode.Position(ln, 0);
        ed.selection = new vscode.Selection(pos, pos);
        ed.revealRange(new vscode.Range(pos, pos));
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("tonic.gitConflictsToTonicPreview", async () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) {
        return;
      }
      const text = ed.document.getText();
      if (!hasGitConflictMarkers(text)) {
        await vscode.window.showInformationMessage("Tonic: no Git conflict markers in this file.");
        return;
      }
      const blocks = parseGitConflicts(text);
      const lines = gitConflictBlocksToTonicAnnotatedPreview(blocks);
      const doc = await vscode.workspace.openTextDocument({
        content: lines.join("\n"),
        language: "plaintext",
      });
      await vscode.window.showTextDocument(doc, { preview: true });
      await vscode.window.showInformationMessage(
        "Tonic: opened Tonic-style preview from Git markers (read-only buffer).",
      );
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("tonic.applyMergeReportToWorkspace", async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { JSON: ["json"] },
        openLabel: "Select merge report",
      });
      if (!uris?.[0]) {
        return;
      }
      let text: string;
      try {
        text = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString("utf8");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`Tonic: could not read report: ${msg}`);
        return;
      }
      try {
        const report = parseMergeReportJson(text);
        const candidates = report.files.filter(
          (f) =>
            f.markers_present &&
            ((f.annotated_lines?.length ?? 0) > 0 || (f.conflict_regions?.length ?? 0) > 0),
        );
        if (!candidates.length) {
          await vscode.window.showInformationMessage(
            "Tonic: no conflicted files with marker data in this report.",
          );
          return;
        }
        const picked = await vscode.window.showQuickPick(
          candidates.map((f) => ({
            label: f.path,
            description: `${f.conflict_regions?.length ?? 0} region(s)${blameSummary(f)}`,
            artifact: f,
          })),
          { title: "Apply Tonic markers to workspace path" },
        );
        if (!picked) {
          return;
        }
        await applyArtifactToWorkspace(report, picked.artifact);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`Tonic: ${msg}`);
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("tonic.importMergeReport", async () => {
      const globHint = vscode.workspace.getConfiguration("tonic").get<string>("defaultReportGlob");
      const choice = await vscode.window.showQuickPick(
        ["Open JSON file", "Paste JSON", "Re-open last report file"],
        {
          title: "Import Tonic merge report",
          placeHolder: globHint ? `Hint: ${globHint}` : undefined,
        },
      );
      let text: string | undefined;
      if (choice === "Open JSON file") {
        const defaultUri = await tryOpenLastReportPath();
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          defaultUri: defaultUri ?? undefined,
          filters: { JSON: ["json"] },
          openLabel: "Import",
        });
        if (!uris?.length) {
          return;
        }
        await context.workspaceState.update("tonic.lastReportJsonPath", uris[0].fsPath);
        text = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString("utf8");
      } else if (choice === "Re-open last report file") {
        const uri = await tryOpenLastReportPath();
        if (!uri) {
          await vscode.window.showInformationMessage("Tonic: no saved report path for this workspace.");
          return;
        }
        text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
      } else if (choice === "Paste JSON") {
        text = await vscode.window.showInputBox({
          title: "Paste merge-tonic-report.json contents",
          ignoreFocusOut: true,
        });
        if (!text?.trim()) {
          return;
        }
      } else {
        return;
      }
      try {
        const report = parseMergeReportJson(text);
        const withMarkers = report.files.filter((f) => f.markers_present && f.annotated_lines?.length);
        const legacy = report.files.filter(
          (f) =>
            f.markers_present &&
            !(f.annotated_lines?.length ?? 0) &&
            (f.conflict_regions?.length ?? 0) > 0,
        );

        type PickItem = { label: string; description: string; artifact: MergeArtifactJson; reconstructed?: boolean };
        let items: PickItem[] = withMarkers.map((f) => ({
          label: f.path,
          description: `${f.conflict_regions?.length ?? 0} region(s)${blameSummary(f)}`,
          artifact: f,
        }));

        if (!items.length && legacy.length) {
          const legPick = await vscode.window.showQuickPick(
            legacy.map((f) => ({
              label: f.path,
              description: `${f.conflict_regions?.length ?? 0} region(s) — reconstruct markers`,
              artifact: f,
            })),
            { title: "No annotated_lines — open reconstructed Tonic markers from regions?" },
          );
          if (!legPick) {
            return;
          }
          items = [
            {
              label: legPick.label,
              description: legPick.description,
              artifact: legPick.artifact,
              reconstructed: true,
            },
          ];
        }

        if (!items.length) {
          const hasMarkersNoAnnotated = report.files.some(
            (f) => f.markers_present && !f.annotated_lines?.length,
          );
          const msg = hasMarkersNoAnnotated
            ? "Tonic: markers_present but no annotated_lines and no conflict_regions to reconstruct. Use a current agent run."
            : "Tonic: no files with conflict markers in this report.";
          await vscode.window.showInformationMessage(msg);
          return;
        }

        let picked: PickItem | undefined;
        if (items.length === 1) {
          picked = items[0];
        } else {
          const multi = await vscode.window.showQuickPick(items, {
            title: "Open annotated merge output",
            placeHolder: "Select a file",
          });
          picked = multi ?? undefined;
        }
        if (!picked) {
          return;
        }

        let body: string;
        if (picked.reconstructed) {
          const regions = regionsJsonToCore(picked.artifact.conflict_regions);
          body = conflictRegionsToAnnotatedLines(regions).join("\n");
        } else {
          body = picked.artifact.annotated_lines!.join("\n");
        }
        setLastImportedArtifact(report, picked.artifact);
        const doc = await vscode.workspace.openTextDocument({
          content: body,
          language: "plaintext",
        });
        await vscode.window.showTextDocument(doc, { preview: true });
        await vscode.window.showInformationMessage(
          `Tonic: opened ${picked.reconstructed ? "reconstructed" : "annotated"} output for ${picked.label} (left=base, right=head).`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`Tonic import failed: ${msg}`);
      }
    })
  );

  refresh();
}

export function deactivate(): void {
  decorationTypes?.left.dispose();
  decorationTypes?.right.dispose();
  decorationTypes?.header.dispose();
}
