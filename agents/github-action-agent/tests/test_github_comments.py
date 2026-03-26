from tonic_agent.github_comments import (
    Verbosity,
    build_file_top_comment,
    build_inline_thread_comment,
    build_summary_body,
    marker_file,
    marker_summary,
)


def test_markers_stable():
    assert "tonic-agent:summary:run1" in marker_summary("run1")
    assert "path" in marker_file("path", "abc")


def test_summary_body():
    body = build_summary_body("rid", "My PR", [{"path": "a.py"}], verbosity=Verbosity.MEDIUM)
    assert "Tonic merge report" in body
    assert "rid" in body


def test_file_and_inline():
    b = build_file_top_comment("f.py", ["a"], ["b"], ["<<<<<<< begin added left", "x", ">>>>>>> end conflict"])
    assert "f.py" in b
    i = build_inline_thread_comment("f.py", 1, 3, "added left", "snippet")
    assert "added left" in i
    assert "tonic-agent:inline" in i
