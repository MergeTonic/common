import * as vscode from "vscode";

/**
 * When the merge editor is active, try to open the same resource in merge mode.
 * VS Code exposes limited API for merge editors; this is a best-effort hook.
 */
export async function openInMergeEditor(uri: vscode.Uri): Promise<void> {
  const mergeCommand = "merge.mergeEditor.openFromResource";
  const available = await vscode.commands.getCommands(true);
  if (!available.includes(mergeCommand)) {
    const pick = await vscode.window.showInformationMessage(
      "Merge editor command is unavailable in this workspace. Open file and jump to next Tonic conflict?",
      "Open file",
      "Open + Next conflict",
    );
    await vscode.window.showTextDocument(uri);
    if (pick === "Open + Next conflict") {
      await vscode.commands.executeCommand("tonic.jumpNextConflict");
    }
    return;
  }
  try {
    await vscode.commands.executeCommand(mergeCommand, uri);
  } catch {
    const pick = await vscode.window.showInformationMessage(
      "Could not open merge editor for this file. Open file and jump to next Tonic conflict?",
      "Open file",
      "Open + Next conflict",
    );
    await vscode.window.showTextDocument(uri);
    if (pick === "Open + Next conflict") {
      await vscode.commands.executeCommand("tonic.jumpNextConflict");
    }
  }
}
