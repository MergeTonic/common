import * as vscode from "vscode";
import {
  hasGitConflictMarkers,
  parseGitConflictsWithDiagnostics,
  parseTonicConflictsWithDiagnostics,
} from "@mergetonic/core";

function lineFromWarning(w: string): number {
  const m = w.match(/line (\d+)/);
  if (m) {
    return Math.max(0, parseInt(m[1]!, 10) - 1);
  }
  return 0;
}

export function collectTonicDiagnostics(text: string): vscode.Diagnostic[] {
  const out: vscode.Diagnostic[] = [];
  if (text.includes("<<<<<<< begin ")) {
    const { warnings } = parseTonicConflictsWithDiagnostics(text);
    for (const w of warnings) {
      const ln = lineFromWarning(w);
      out.push(
        new vscode.Diagnostic(
          new vscode.Range(ln, 0, ln, 0),
          w,
          vscode.DiagnosticSeverity.Warning,
        ),
      );
    }
  }
  if (hasGitConflictMarkers(text)) {
    const { warnings } = parseGitConflictsWithDiagnostics(text);
    for (const w of warnings) {
      const ln = lineFromWarning(w);
      out.push(
        new vscode.Diagnostic(
          new vscode.Range(ln, 0, ln, 0),
          `Git conflict: ${w}`,
          vscode.DiagnosticSeverity.Information,
        ),
      );
    }
  }
  return out;
}

export function registerTonicDiagnostics(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
  const coll = vscode.languages.createDiagnosticCollection("tonic");
  const refresh = (doc: vscode.TextDocument | undefined) => {
    if (!doc || doc.uri.scheme !== "file") {
      return;
    }
    const t = doc.getText();
    if (!t.includes("<<<<<<< ") && !hasGitConflictMarkers(t)) {
      coll.delete(doc.uri);
      return;
    }
    coll.set(doc.uri, collectTonicDiagnostics(t));
  };
  context.subscriptions.push(coll);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((d) => refresh(d)),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => refresh(e.document)),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((ed) => refresh(ed?.document)),
  );
  refresh(vscode.window.activeTextEditor?.document);
  return coll;
}
