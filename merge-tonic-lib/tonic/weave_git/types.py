from __future__ import annotations

from typing import NotRequired, TypedDict


class PathManifestEntry(TypedDict, total=False):
    text_blob_sha: str
    weave_serialized_sha: str
    weave_format_version: str
    diff_engine_id: str
    parent_weave_shas: list[str]
    degraded: bool
    squash: bool
    weave_object_key: str


class TonicGitManifestRequired(TypedDict):
    schema: str
    version: str
    commit: str
    paths: dict[str, PathManifestEntry]


class TonicGitManifest(TonicGitManifestRequired, total=False):
    diff_engine_id: NotRequired[str]
    weave_format_version: NotRequired[str]
