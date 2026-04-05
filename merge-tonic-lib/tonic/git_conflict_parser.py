"""Parse standard Git `<<<<<<<` conflict markers (parity with gitConflictParser.ts)."""

from __future__ import annotations

import re
from dataclasses import dataclass

GIT_BEGIN = re.compile(r"^<<<<<<< (.+)$")
GIT_SEP = re.compile(r"^=======\s*$")
GIT_END = re.compile(r"^>>>>>>> (.+)$")


@dataclass
class GitConflictSegment:
    label: str
    lines: list[str]


@dataclass
class GitConflictBlock:
    start_line: int
    end_line: int
    segments: list[GitConflictSegment]


def parse_git_conflicts(text: str) -> list[GitConflictBlock]:
    lines = text.splitlines()
    blocks: list[GitConflictBlock] = []
    i = 0
    while i < len(lines):
        begin_m = GIT_BEGIN.match(lines[i])
        if not begin_m:
            i += 1
            continue
        start_line = i
        i += 1
        ours: list[str] = []
        while i < len(lines):
            if GIT_SEP.match(lines[i]):
                break
            ours.append(lines[i])
            i += 1
        if i >= len(lines):
            break
        i += 1
        theirs: list[str] = []
        closed = False
        while i < len(lines):
            end_m = GIT_END.match(lines[i])
            if end_m:
                blocks.append(
                    GitConflictBlock(
                        start_line=start_line,
                        end_line=i,
                        segments=[
                            GitConflictSegment(label=begin_m.group(1).strip(), lines=ours),
                            GitConflictSegment(label=end_m.group(1).strip(), lines=theirs),
                        ],
                    )
                )
                i += 1
                closed = True
                break
            theirs.append(lines[i])
            i += 1
        if not closed:
            break
    return blocks
