from tonic_agent.suggestions import (
    build_unified_diff,
    parse_resolved_lines_from_ai,
    strip_json_fences,
)


def test_strip_json_fences():
    assert strip_json_fences('```json\n{"a": 1}\n```').strip() == '{"a": 1}'


def test_parse_resolved_lines_from_ai_json():
    raw = '{"resolved_lines": ["a", "b"], "rationale": "ok"}'
    lines, rat = parse_resolved_lines_from_ai(raw)
    assert lines == ["a", "b"]
    assert rat == "ok"


def test_parse_resolved_lines_plain():
    lines, rat = parse_resolved_lines_from_ai("one\ntwo")
    assert lines == ["one", "two"]
    assert rat is None


def test_build_unified_diff():
    d = build_unified_diff(["a"], ["b"], path="f.txt")
    assert "-a" in d
    assert "+b" in d
