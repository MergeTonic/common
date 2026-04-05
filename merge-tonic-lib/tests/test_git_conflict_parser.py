from __future__ import annotations

from tonic.git_conflict_parser import parse_git_conflicts
from tonic.git_merge_tonic import git_merge_file_output_to_tonic_annotated


def test_parse_git_conflicts_one_block() -> None:
    s = "a\n<<<<<<< X\nl\n=======\nr\n>>>>>>> Y\nb\n"
    blocks = parse_git_conflicts(s)
    assert len(blocks) == 1
    assert blocks[0].segments[0].lines == ["l"]
    assert blocks[0].segments[1].lines == ["r"]


def test_git_merge_to_tonic() -> None:
    s = "<<<<<<< X\nl\n=======\nr\n>>>>>>> Y\n"
    out = git_merge_file_output_to_tonic_annotated(s)
    assert any(x.startswith("<<<<<<< begin") for x in out)
