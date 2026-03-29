"""Git-merge author/intent hydration helpers."""

from tonic_agent.git_merge_hydration import (
    GitMergeHydrationOptions,
    format_conflict_label,
    git_blocks_to_tonic_annotated,
    parse_intent_pair,
    sanitize_author_tag_token,
)


def test_sanitize_author_tag_token():
    assert sanitize_author_tag_token("  a b  ") == "a_b"
    assert "|" not in sanitize_author_tag_token("a|b")


def test_format_conflict_label_sorts_tags():
    s = format_conflict_label("git merge", {"intent": "x", "author": "y"})
    assert s == "git merge | author=y | intent=x"


def test_parse_intent_pair():
    assert parse_intent_pair("a,b") == ("a", "b")
    assert parse_intent_pair(" a , b ") == ("a", "b")
    assert parse_intent_pair("") is None
    assert parse_intent_pair("only") is None


def test_git_blocks_to_tonic_annotated_explicit_aliases():
    blocks = [(["L"], ["R"])]
    opts = GitMergeHydrationOptions(
        author_mode="base-head",
        explicit_left_author="alice",
        explicit_right_author="bob",
        left_intent="security",
        right_intent="refactor",
    )
    lines = git_blocks_to_tonic_annotated(
        blocks,
        workspace="w",
        base_sha="b",
        head_sha="h",
        opts=opts,
    )
    assert lines[0] == "<<<<<<< begin git merge | author=alice | intent=security"
    assert lines[2] == "======= begin git merge | author=bob | intent=refactor"
