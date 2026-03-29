import * as vscode from "vscode";
import { conflictSummary, parseConflictLabel, parseTonicConflicts } from "@mergetonic/core";

export class ConflictTreeProvider implements vscode.TreeDataProvider<ConflictItem> {
  private _doc: vscode.TextDocument | undefined;
  private _onDidChange = new vscode.EventEmitter<ConflictItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  setDocument(doc: vscode.TextDocument | undefined): void {
    this._doc = doc;
    this._onDidChange.fire(undefined);
  }

  getTreeItem(element: ConflictItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ConflictItem): ConflictItem[] {
    if (element) {
      return [];
    }
    if (!this._doc) {
      return [];
    }
    const blocks = parseTonicConflicts(this._doc.getText());
    return blocks.map((b, i) => {
      const meta = parseConflictLabel(b.kind);
      const author = meta.tags.author ? ` | author:${meta.tags.author}` : "";
      const intent = meta.tags.intent ? ` | intent:${meta.tags.intent}` : "";
      return new ConflictItem(
        `${conflictSummary(b)}${author}${intent}`,
        b.startLine,
        i,
        vscode.TreeItemCollapsibleState.None,
      );
    });
  }
}

export class ConflictItem extends vscode.TreeItem {
  constructor(
    label: string,
    readonly startLine: number,
    idx: number,
    state: vscode.TreeItemCollapsibleState
  ) {
    super(label, state);
    this.command = {
      command: "tonic.jumpToLine",
      title: "Jump",
      arguments: [startLine],
    };
    this.iconPath = new vscode.ThemeIcon("warning");
  }
}
