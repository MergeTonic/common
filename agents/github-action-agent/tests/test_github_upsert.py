from unittest.mock import patch

from tonic_agent.github_api import upsert_issue_comment


def test_upsert_patches_when_marker_found():
    with (
        patch("tonic_agent.github_api.list_issue_comments") as list_m,
        patch("tonic_agent.github_api.update_issue_comment") as upd,
        patch("tonic_agent.github_api.post_issue_comment") as post,
    ):
        list_m.return_value = [
            {"id": 99, "body": "hello\n<!-- tonic-agent:summary\n-->"},
        ]
        upsert_issue_comment("o", "r", 1, "tok", "<!-- tonic-agent:summary", "new body")
        upd.assert_called_once_with("o", "r", 99, "new body", "tok")
        post.assert_not_called()


def test_upsert_posts_when_missing():
    with (
        patch("tonic_agent.github_api.list_issue_comments") as list_m,
        patch("tonic_agent.github_api.update_issue_comment") as upd,
        patch("tonic_agent.github_api.post_issue_comment") as post,
    ):
        list_m.return_value = [{"id": 1, "body": "other"}]
        post.return_value = {"id": 2}
        upsert_issue_comment("o", "r", 1, "tok", "<!-- tonic-agent:summary", "body")
        upd.assert_not_called()
        post.assert_called_once()
