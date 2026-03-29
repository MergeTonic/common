import * as vscode from "vscode";
import { type ConflictBlock, parseTonicConflicts } from "@mergetonic/core";
import { semanticColorForLabel } from "./config/conflictLabelConfig";

export function createDecorationTypes(): {
  left: vscode.TextEditorDecorationType;
  right: vscode.TextEditorDecorationType;
  header: vscode.TextEditorDecorationType;
} {
  return {
    left: vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("tonic.leftBackground"),
      isWholeLine: true,
    }),
    right: vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("tonic.rightBackground"),
      isWholeLine: true,
    }),
    header: vscode.window.createTextEditorDecorationType({
      fontWeight: "bold",
    }),
  };
}

function lineOffsetToRange(
  lines: string[],
  globalStartLine: number,
  segLines: string[]
): vscode.Range[] {
  const ranges: vscode.Range[] = [];
  let ln = globalStartLine;
  for (const _ of segLines) {
    ranges.push(new vscode.Range(ln, 0, ln, lines[ln]?.length ?? 0));
    ln += 1;
  }
  return ranges;
}

export function rangesForBlock(doc: vscode.TextDocument, block: ConflictBlock): {
  left: vscode.Range[];
  right: vscode.Range[];
  headers: vscode.Range[];
} {
  const lines = doc.getText().split(/\r?\n/);
  const left: vscode.Range[] = [];
  const right: vscode.Range[] = [];
  const headers: vscode.Range[] = [];
  headers.push(
    new vscode.Range(block.startLine, 0, block.startLine, lines[block.startLine]?.length ?? 0)
  );
  let linePtr = block.startLine + 1;
  for (let s = 0; s < block.segments.length; s++) {
    const seg = block.segments[s];
    const useLeft = s % 2 === 0;
    const bucket = useLeft ? left : right;
    for (const _ of seg.lines) {
      if (linePtr < lines.length) {
        bucket.push(
          new vscode.Range(linePtr, 0, linePtr, lines[linePtr].length)
        );
      }
      linePtr += 1;
    }
    if (s < block.segments.length - 1) {
      if (linePtr < lines.length && lines[linePtr].startsWith("======= begin ")) {
        headers.push(
          new vscode.Range(linePtr, 0, linePtr, lines[linePtr].length)
        );
        linePtr += 1;
      }
    }
  }
  if (linePtr < lines.length && lines[linePtr].startsWith(">>>>>>> end conflict")) {
    headers.push(new vscode.Range(linePtr, 0, linePtr, lines[linePtr].length));
  }
  return { left, right, headers };
}

export function decorateDocument(
  editor: vscode.TextEditor,
  types: ReturnType<typeof createDecorationTypes>
): void {
  const doc = editor.document;
  const text = doc.getText();
  const blocks = parseTonicConflicts(text);
  const left: vscode.Range[] = [];
  const right: vscode.Range[] = [];
  const headers: vscode.Range[] = [];
  for (const b of blocks) {
    const r = rangesForBlock(doc, b);
    left.push(...r.left);
    right.push(...r.right);
    headers.push(...r.headers);
  }
  const semanticLeft = collectSemanticRanges(doc, blocks, 0);
  const semanticRight = collectSemanticRanges(doc, blocks, 1);
  if (semanticLeft.size === 0 && semanticRight.size === 0) {
    editor.setDecorations(types.left, left);
    editor.setDecorations(types.right, right);
  } else {
    editor.setDecorations(types.left, []);
    editor.setDecorations(types.right, []);
    const merged = new Map<string, vscode.Range[]>();
    for (const [color, ranges] of [...semanticLeft.entries(), ...semanticRight.entries()]) {
      merged.set(color, [...(merged.get(color) ?? []), ...ranges]);
    }
    applySemanticDecorations(editor, merged);
  }
  editor.setDecorations(types.header, headers);
}

const dynamicDecorationTypes: vscode.TextEditorDecorationType[] = [];

function collectSemanticRanges(
  doc: vscode.TextDocument,
  blocks: ConflictBlock[],
  parity: 0 | 1,
): Map<string, vscode.Range[]> {
  const byColor = new Map<string, vscode.Range[]>();
  for (const block of blocks) {
    const rangeSet = rangesForBlock(doc, block);
    const ranges = parity === 0 ? rangeSet.left : rangeSet.right;
    if (ranges.length === 0) {
      continue;
    }
    const segment = block.segments.find((_, idx) => idx % 2 === parity);
    const color = semanticColorForLabel(segment?.label ?? block.kind);
    if (!color) {
      continue;
    }
    byColor.set(color, [...(byColor.get(color) ?? []), ...ranges]);
  }
  return byColor;
}

function applySemanticDecorations(editor: vscode.TextEditor, byColor: Map<string, vscode.Range[]>): void {
  while (dynamicDecorationTypes.length > 0) {
    dynamicDecorationTypes.pop()?.dispose();
  }
  for (const [color, ranges] of byColor.entries()) {
    const type = vscode.window.createTextEditorDecorationType({
      backgroundColor: color,
      isWholeLine: true,
    });
    dynamicDecorationTypes.push(type);
    editor.setDecorations(type, ranges);
  }
}
