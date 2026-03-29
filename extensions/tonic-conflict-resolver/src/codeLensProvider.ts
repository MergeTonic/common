import * as vscode from "vscode";
import { type ConflictBlock, parseTonicConflicts } from "@mergetonic/core";

export class TonicCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChange.event;

  provideCodeLenses(
    doc: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    if (!doc.getText().includes("<<<<<<< begin ")) {
      return [];
    }
    const blocks = parseTonicConflicts(doc.getText());
    const lenses: vscode.CodeLens[] = [];
    for (const b of blocks) {
      const range = new vscode.Range(b.startLine, 0, b.startLine, 0);
      lenses.push(
        new vscode.CodeLens(range, {
          title: "Keep Left",
          command: "tonic.keepLeft",
          arguments: [b.startLine],
        })
      );
      lenses.push(
        new vscode.CodeLens(range, {
          title: "Keep Right",
          command: "tonic.keepRight",
          arguments: [b.startLine],
        })
      );
      lenses.push(
        new vscode.CodeLens(range, {
          title: "Keep Both",
          command: "tonic.keepBoth",
          arguments: [b.startLine],
        })
      );
      lenses.push(
        new vscode.CodeLens(range, {
          title: "Resolve with AI",
          command: "tonic.resolveWithAI",
          arguments: [b.startLine],
        })
      );
    }
    return lenses;
  }

  refresh(): void {
    this._onDidChange.fire();
  }
}
