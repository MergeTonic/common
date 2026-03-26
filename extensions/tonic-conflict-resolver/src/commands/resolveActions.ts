import * as vscode from "vscode";
import { parseTonicConflicts } from "@mergetonic/core";

function findBlockAtLine(blocks: ReturnType<typeof parseTonicConflicts>, line: number) {
  return blocks.find((b) => b.startLine === line) ?? blocks[0];
}

export async function keepLeft(editor: vscode.TextEditor, startLine: number): Promise<void> {
  const blocks = parseTonicConflicts(editor.document.getText());
  const b = findBlockAtLine(blocks, startLine);
  if (!b) {
    return;
  }
  const leftText = b.segments[0]?.lines.join("\n") ?? "";
  await replaceBlock(editor, b.startLine, b.endLine, leftText);
}

export async function keepRight(editor: vscode.TextEditor, startLine: number): Promise<void> {
  const blocks = parseTonicConflicts(editor.document.getText());
  const b = findBlockAtLine(blocks, startLine);
  if (!b || b.segments.length < 2) {
    return;
  }
  const rightText = b.segments[1]?.lines.join("\n") ?? "";
  await replaceBlock(editor, b.startLine, b.endLine, rightText);
}

export async function keepBoth(editor: vscode.TextEditor, startLine: number): Promise<void> {
  const blocks = parseTonicConflicts(editor.document.getText());
  const b = findBlockAtLine(blocks, startLine);
  if (!b) {
    return;
  }
  const parts = b.segments.map((s) => s.lines.join("\n")).filter(Boolean);
  await replaceBlock(editor, b.startLine, b.endLine, parts.join("\n"));
}

export async function applyResolvedLines(
  editor: vscode.TextEditor,
  startLine: number,
  resolvedLines: string[],
): Promise<boolean> {
  const blocks = parseTonicConflicts(editor.document.getText());
  const b = findBlockAtLine(blocks, startLine);
  if (!b) {
    return false;
  }
  await replaceBlock(editor, b.startLine, b.endLine, resolvedLines.join("\n"));
  return true;
}

export async function replaceBlock(
  editor: vscode.TextEditor,
  startLine: number,
  endLine: number,
  newBody: string
): Promise<void> {
  const start = new vscode.Position(startLine, 0);
  const end = new vscode.Position(endLine, editor.document.lineAt(endLine).text.length);
  const range = new vscode.Range(start, end);
  await editor.edit((eb) => eb.replace(range, newBody));
}
