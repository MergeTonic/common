"""Hub community discussions / PR-style flows (orchestration shape aligned with GitHub create_pull_request)."""

from __future__ import annotations

from dataclasses import dataclass

from .client import hub_offline


@dataclass(frozen=True)
class HubPullRequestResult:
    """Stable tuple-like result for job orchestration (mirrors GitHub ``(number, head_sha)`` intent)."""

    discussion_id: int
    url: str
    head_sha: str


def create_hub_pull_request(
    repo_id: str,
    *,
    title: str,
    body: str = "",
    token: str | None = None,
) -> HubPullRequestResult:
    """Open a Hub model repo discussion (PR type when available via API).

    Requires ``huggingface_hub`` and ``HF_TOKEN`` with write access. When offline or API unavailable,
    raises ``RuntimeError``.
    """
    _ = token
    if hub_offline():
        raise RuntimeError("create_hub_pull_request: Hub offline (HF_HUB_OFFLINE / TONIC_HF_WEAVE_OFFLINE)")
    try:
        from huggingface_hub import HfApi
    except Exception as e:
        raise RuntimeError("create_hub_pull_request: huggingface_hub not available") from e
    api = HfApi()
    try:
        disc = api.create_discussion(
            repo_id=repo_id,
            title=title,
            description=body or title,
            repo_type="model",
            pull_request=True,
        )
    except Exception as e:
        raise RuntimeError(f"create_hub_pull_request: create_discussion failed: {e}") from e
    did = int(getattr(disc, "num", 0) or 0)
    url = str(getattr(disc, "url", "") or f"https://huggingface.co/{repo_id}/discussions")
    return HubPullRequestResult(discussion_id=did, url=url, head_sha="")
