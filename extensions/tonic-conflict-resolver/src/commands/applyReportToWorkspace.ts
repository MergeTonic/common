import * as vscode from "vscode";
import { conflictRegionsToAnnotatedLines } from "@mergetonic/core";
import {
  applyGitMergeReconstructDefaults,
  readGitMergeDefaultsFromConfig,
  reportRegionsToCore,
} from "../gitMergeReconstruct";
import type { MergeArtifactJson, MergeReportJson } from "../mergeReport";

function artifactBody(a: MergeArtifactJson): string | null {
  if (a.annotated_lines?.length) {
    return a.annotated_lines.join("\n");
  }
  const raw = reportRegionsToCore(a.conflict_regions);
  if (raw.length) {
    const regions = applyGitMergeReconstructDefaults(raw, readGitMergeDefaultsFromConfig());
    return conflictRegionsToAnnotatedLines(regions).join("\n");
  }
  return null;
}

/**
 * Write Tonic marker text for one artifact to `workspaceFolder/artifact.path`.
 */
export async function applyArtifactToWorkspace(
  _report: MergeReportJson,
  artifact: MergeArtifactJson,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    await vscode.window.showErrorMessage("Tonic: open a folder in the workspace first.");
    return;
  }
  const body = artifactBody(artifact);
  if (body == null) {
    await vscode.window.showErrorMessage(
      "Tonic: no annotated_lines or conflict_regions to write for this file.",
    );
    return;
  }

  const target = vscode.Uri.joinPath(folder.uri, artifact.path.replace(/\\/g, "/"));
  const pick = await vscode.window.showWarningMessage(
    `Tonic: overwrite workspace file?\n${vscode.workspace.asRelativePath(target)}`,
    { modal: true },
    "Write file",
    "Cancel",
  );
  if (pick !== "Write file") {
    return;
  }

  try {
    await vscode.workspace.fs.stat(target);
    const norm = artifact.path.replace(/\\/g, "/").split("/");
    const fileName = norm.pop() ?? "file";
    const bakName = `${fileName}.tonic.bak`;
    const bak =
      norm.length > 0
        ? vscode.Uri.joinPath(folder.uri, ...norm, bakName)
        : vscode.Uri.joinPath(folder.uri, bakName);
    const prev = await vscode.workspace.fs.readFile(target);
    await vscode.workspace.fs.writeFile(bak, prev);
  } catch {
    /* file may not exist */
  }

  await vscode.workspace.fs.writeFile(target, Buffer.from(body, "utf8"));
  await vscode.window.showInformationMessage(
    `Tonic: wrote markers to ${artifact.path}. Open the file to use CodeLens / decorations.`,
  );
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc);
}
