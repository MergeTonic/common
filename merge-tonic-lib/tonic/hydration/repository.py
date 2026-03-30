"""Repository enumeration helpers with git-aware ignore handling."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path
import re
import subprocess


DEFAULT_DENY_PATH_PREFIXES = [
    ".git/",
    ".tonic/",
    "node_modules/",
    "__pycache__/",
    ".gitignore",
    ".gitattributes",
    ".gitmodules",
]

SECRET_FILE_PATTERN = re.compile(
    r"(^|/)(\.env($|\.)|id_rsa($|\.)|id_ed25519($|\.)|.*\.(pem|key|p12|pfx|crt|der|cer))$",
    re.IGNORECASE,
)
GIT_METADATA_FILE_PATTERN = re.compile(r"(^|/)\.(gitignore|gitattributes|gitmodules)$", re.IGNORECASE)


@dataclass(frozen=True)
class HydrationRepositoryFile:
    relative_path: str
    absolute_path: Path
    content: str
    content_hash: str
    size_bytes: int


def _normalize_relative_path(value: str) -> str:
    normalized = value.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized.lstrip("/")


def _hash_content(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8", errors="replace")).hexdigest()


def _looks_like_text(buffer: bytes) -> bool:
    return b"\x00" not in buffer


def _should_ignore_path(relative_path: str, deny_path_prefixes: list[str]) -> bool:
    normalized = _normalize_relative_path(relative_path)
    if (
        not normalized
        or SECRET_FILE_PATTERN.search(normalized)
        or GIT_METADATA_FILE_PATTERN.search(normalized)
    ):
        return True
    return any(normalized.startswith(prefix) for prefix in deny_path_prefixes)


def _wildcard_to_regex(pattern: str) -> re.Pattern[str]:
    escaped = re.escape(pattern)
    escaped = escaped.replace(r"\*\*", "__DOUBLE_STAR__")
    escaped = escaped.replace(r"\*", "[^/]*").replace(r"\?", "[^/]")
    escaped = escaped.replace("__DOUBLE_STAR__", ".*")
    return re.compile(rf"(^|/){escaped}$")


def _matches_gitignore(relative_path: str, gitignore_text: str | None) -> bool:
    if not gitignore_text:
        return False
    normalized = _normalize_relative_path(relative_path)
    ignored = False
    for raw_line in gitignore_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        negated = line.startswith("!")
        pattern = (line[1:] if negated else line).strip().lstrip("/")
        if not pattern:
            continue
        if _wildcard_to_regex(pattern).search(normalized):
            ignored = not negated
    return ignored


def _matches_scope(relative_path: str, scope_patterns: list[str]) -> bool:
    if not scope_patterns:
        return True
    normalized = _normalize_relative_path(relative_path)
    return any(_wildcard_to_regex(_normalize_relative_path(pattern)).search(normalized) for pattern in scope_patterns)


def _load_gitignore_text(repo_root: Path) -> str | None:
    gitignore_path = repo_root / ".gitignore"
    if not gitignore_path.is_file():
        return None
    try:
        return gitignore_path.read_text(encoding="utf-8")
    except Exception:
        return None


def _walk_fallback(repo_root: Path, deny_path_prefixes: list[str], gitignore_text: str | None) -> list[str]:
    out: list[str] = []
    for child in repo_root.rglob("*"):
        if not child.is_file():
            continue
        relative_path = _normalize_relative_path(str(child.relative_to(repo_root)))
        if _should_ignore_path(relative_path, deny_path_prefixes) or _matches_gitignore(
            relative_path, gitignore_text
        ):
            continue
        out.append(relative_path)
    out.sort()
    return out


def _load_git_toplevel(repo_root: Path) -> Path | None:
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "--show-toplevel"],
            check=True,
            capture_output=True,
            text=True,
        )
        value = (proc.stdout or "").strip()
        if not value:
            return None
        return Path(value).resolve()
    except Exception:
        return None


class HydrationRepository:
    def __init__(
        self,
        repo_root: str | Path,
        *,
        deny_path_prefixes: list[str] | None = None,
        max_file_bytes: int = 512 * 1024,
        scope_patterns: list[str] | None = None,
        include_paths: list[str] | None = None,
    ) -> None:
        self.repo_root = Path(repo_root).resolve()
        self.deny_path_prefixes = [
            *DEFAULT_DENY_PATH_PREFIXES,
            *[_normalize_relative_path(value) for value in (deny_path_prefixes or [])],
        ]
        self.max_file_bytes = max_file_bytes
        self.scope_patterns = [_normalize_relative_path(value) for value in (scope_patterns or []) if value.strip()]
        self.include_paths = [_normalize_relative_path(value) for value in (include_paths or []) if value.strip()]

    def list_indexable_paths(self) -> list[str]:
        gitignore_text = _load_gitignore_text(self.repo_root)
        try:
            git_toplevel = _load_git_toplevel(self.repo_root)
            # Treat repo_root as an isolated workspace boundary.
            # If it's only a nested directory of a larger git repo, git ignore rules from the parent
            # can hide files that should remain indexable for this workspace (e.g., CI temp roots).
            if git_toplevel is None or git_toplevel != self.repo_root:
                raise RuntimeError("repo_root is not git toplevel; use filesystem fallback")
            proc = subprocess.run(
                [
                    "git",
                    "-C",
                    str(self.repo_root),
                    "ls-files",
                    "-z",
                    "--cached",
                    "--others",
                    "--exclude-standard",
                ],
                check=True,
                capture_output=True,
            )
            paths: list[str] = []
            for entry in proc.stdout.decode("utf-8").split("\x00"):
                if not entry:
                    continue
                relative_path = _normalize_relative_path(entry)
                absolute_path = self.repo_root / relative_path
                if _should_ignore_path(relative_path, self.deny_path_prefixes):
                    continue
                if _matches_gitignore(relative_path, gitignore_text):
                    continue
                if not _matches_scope(relative_path, self.scope_patterns):
                    continue
                if absolute_path.is_file():
                    paths.append(relative_path)
            for include_path in self.include_paths:
                absolute_path = self.repo_root / include_path
                if not absolute_path.is_file():
                    continue
                if _should_ignore_path(include_path, self.deny_path_prefixes):
                    continue
                if _matches_gitignore(include_path, gitignore_text):
                    continue
                paths.append(include_path)
            paths.sort()
            return sorted(set(paths))
        except Exception:
            paths = [
                entry
                for entry in _walk_fallback(self.repo_root, self.deny_path_prefixes, gitignore_text)
                if _matches_scope(entry, self.scope_patterns)
            ]
            for include_path in self.include_paths:
                absolute_path = self.repo_root / include_path
                if not absolute_path.is_file():
                    continue
                if _should_ignore_path(include_path, self.deny_path_prefixes):
                    continue
                if _matches_gitignore(include_path, gitignore_text):
                    continue
                paths.append(include_path)
            return sorted(set(paths))

    def read_indexable_files(self) -> list[HydrationRepositoryFile]:
        out: list[HydrationRepositoryFile] = []
        for relative_path in self.list_indexable_paths():
            absolute_path = self.repo_root / relative_path
            if not absolute_path.is_file():
                continue
            buffer = absolute_path.read_bytes()
            if len(buffer) > self.max_file_bytes or not _looks_like_text(buffer):
                continue
            content = buffer.decode("utf-8", errors="replace")
            out.append(
                HydrationRepositoryFile(
                    relative_path=relative_path,
                    absolute_path=absolute_path,
                    content=content,
                    content_hash=_hash_content(content),
                    size_bytes=len(buffer),
                )
            )
        return out
