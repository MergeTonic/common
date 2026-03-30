"""Prompt templates (Tonic semantics; strings from shared prompt bundle)."""

from __future__ import annotations

from enum import Enum

from . import env_config
from .models import ConflictFile, ConflictRegion
from . import prompt_bundle


class PromptTemplate(Enum):
    Default = "default"
    Enhanced = "enhanced"
    ContextAware = "context-aware"


def _bundle_key(t: PromptTemplate) -> str:
    match t:
        case PromptTemplate.Default:
            return "default"
        case PromptTemplate.Enhanced:
            return "enhanced"
        case PromptTemplate.ContextAware:
            return "context_aware"


class PromptGenerator:
    def __init__(self, template: PromptTemplate) -> None:
        self.template = template
        self._bk = _bundle_key(template)

    def generate_system_prompt(self) -> str:
        custom = env_config.get_system_prompt_override()
        if custom is not None:
            return custom
        return prompt_bundle.system_prompt_body(self._bk)

    def generate_conflict_prompt(
        self,
        conflict_file: ConflictFile,
        conflict: ConflictRegion,
        *,
        expected_resolved_line_count: int | None = None,
    ) -> str:
        match self.template:
            case PromptTemplate.Default:
                kind_suffix = f" ({conflict.conflict_kind})" if conflict.conflict_kind else ""
                message = prompt_bundle.format_conflict_user(
                    self._bk,
                    path=conflict_file.path,
                    start_line=str(conflict.start_line),
                    end_line=str(conflict.end_line),
                    kind_suffix=kind_suffix,
                    left_label=conflict_file.left_label,
                    right_label=conflict_file.right_label,
                    left_content=conflict.left_content,
                    right_content=conflict.right_content,
                )
                return _append_line_count_guidance(message, expected_resolved_line_count)
            case PromptTemplate.Enhanced:
                kind = conflict.conflict_kind or "unspecified"
                ft = determine_file_type(conflict_file.path)
                message = prompt_bundle.format_conflict_user(
                    self._bk,
                    path=conflict_file.path,
                    start_line=str(conflict.start_line),
                    end_line=str(conflict.end_line),
                    kind=kind,
                    file_type=ft,
                    left_label=conflict_file.left_label,
                    right_label=conflict_file.right_label,
                    left_content=conflict.left_content,
                    right_content=conflict.right_content,
                )
                return _append_line_count_guidance(message, expected_resolved_line_count)
            case PromptTemplate.ContextAware:
                base_section = (
                    f"BASE VERSION (common ancestor):\n```\n{conflict.base_content}```\n\n"
                    if conflict.base_content.strip()
                    else ""
                )
                surrounding = extract_surrounding_context(conflict_file, conflict)
                ctx_section = (
                    f"SURROUNDING CONTEXT:\n```\n{surrounding}```\n\n" if surrounding.strip() else ""
                )
                ft = determine_file_type(conflict_file.path)
                kind = conflict.conflict_kind or "unspecified"
                message = prompt_bundle.format_conflict_user(
                    self._bk,
                    path=conflict_file.path,
                    start_line=str(conflict.start_line),
                    end_line=str(conflict.end_line),
                    kind=kind,
                    file_type=ft,
                    base_section=base_section,
                    ctx_section=ctx_section,
                    left_label=conflict_file.left_label,
                    right_label=conflict_file.right_label,
                    left_content=conflict.left_content,
                    right_content=conflict.right_content,
                )
                return _append_line_count_guidance(message, expected_resolved_line_count)

    def generate_file_prompt(self, conflict_file: ConflictFile) -> str:
        match self.template:
            case PromptTemplate.Default:
                parts: list[str] = []
                for i, c in enumerate(conflict_file.conflicts):
                    parts.append(
                        f"CONFLICT {i + 1}:\nBetween lines {c.start_line} and {c.end_line}\n"
                        f"LEFT:\n```\n{c.left_content}```\n"
                        f"RIGHT:\n```\n{c.right_content}```\n\n"
                    )
                body = "".join(parts)
                return prompt_bundle.format_file_user(
                    self._bk,
                    path=conflict_file.path,
                    conflict_count=str(len(conflict_file.conflicts)),
                    conflicts_body=body,
                )
            case PromptTemplate.Enhanced:
                ft = determine_file_type(conflict_file.path)
                parts = []
                for i, c in enumerate(conflict_file.conflicts):
                    parts.append(
                        f"CONFLICT {i + 1}:\n"
                        f"- Location: Lines {c.start_line} to {c.end_line}\n"
                        f"- Kind: {c.conflict_kind or 'unspecified'}\n"
                        f"LEFT:\n```\n{c.left_content}```\n"
                        f"RIGHT:\n```\n{c.right_content}```\n\n"
                    )
                return prompt_bundle.format_file_user(
                    self._bk,
                    path=conflict_file.path,
                    file_type=ft,
                    conflict_count=str(len(conflict_file.conflicts)),
                    conflicts_body="".join(parts),
                )
            case PromptTemplate.ContextAware:
                ft = determine_file_type(conflict_file.path)
                parts = []
                for i, c in enumerate(conflict_file.conflicts):
                    base_sec = f"BASE:\n```\n{c.base_content}```\n" if c.base_content.strip() else ""
                    parts.append(
                        f"CONFLICT {i + 1}:\n"
                        f"- Lines {c.start_line} to {c.end_line}\n"
                        f"{base_sec}"
                        f"LEFT:\n```\n{c.left_content}```\n"
                        f"RIGHT:\n```\n{c.right_content}```\n\n"
                    )
                return prompt_bundle.format_file_user(
                    self._bk,
                    path=conflict_file.path,
                    file_type=ft,
                    conflict_count=str(len(conflict_file.conflicts)),
                    conflicts_body="".join(parts),
                )


def determine_file_type(path: str) -> str:
    if "." not in path:
        return "Unknown file type"
    extension = path.rsplit(".", 1)[-1].lower()
    match extension:
        case "rs":
            return "Rust"
        case "js":
            return "JavaScript"
        case "ts":
            return "TypeScript"
        case "py":
            return "Python"
        case "md":
            return "Markdown"
        case "json":
            return "JSON"
        case "yml" | "yaml":
            return "YAML"
        case "toml":
            return "TOML"
        case _:
            return f"File with .{extension} extension"


def extract_surrounding_context(conflict_file: ConflictFile, conflict: ConflictRegion) -> str:
    if not conflict_file.content:
        return ""
    lines = conflict_file.content.splitlines()
    start = max(0, conflict.start_line - 3)
    end = min(len(lines), conflict.end_line + 2)
    return "\n".join(lines[start:end])


def build_expected_resolved_line_count_guidance(expected_resolved_line_count: int | None) -> str:
    if expected_resolved_line_count is None or expected_resolved_line_count <= 0:
        return ""
    noun = "line" if expected_resolved_line_count == 1 else "lines"
    return (
        "Important output constraint: return exactly "
        f"{expected_resolved_line_count} {noun} in resolved_lines so the "
        "suggestion matches the current head-side span length."
    )


def _append_line_count_guidance(message: str, expected_resolved_line_count: int | None) -> str:
    guidance = build_expected_resolved_line_count_guidance(expected_resolved_line_count)
    if not guidance:
        return message
    return f"{message}\n\n{guidance}"


def prompt_template_from_env() -> PromptTemplate:
    raw = (env_config.get_prompt_template_name() or "enhanced").lower().strip()
    if raw == "default":
        return PromptTemplate.Default
    if raw in ("context-aware", "context_aware", "contextaware"):
        return PromptTemplate.ContextAware
    return PromptTemplate.Enhanced
