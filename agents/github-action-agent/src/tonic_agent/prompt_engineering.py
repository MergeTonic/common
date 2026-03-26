"""Prompt templates (Tonic semantics; adapted from rizzler prompt_engineering)."""

from __future__ import annotations

from enum import Enum

from . import env_config
from .models import ConflictFile, ConflictRegion


class PromptTemplate(Enum):
    Default = "default"
    Enhanced = "enhanced"
    ContextAware = "context-aware"


class PromptGenerator:
    def __init__(self, template: PromptTemplate) -> None:
        self.template = template

    def generate_system_prompt(self) -> str:
        custom = env_config.get_system_prompt_override()
        if custom is not None:
            return custom
        match self.template:
            case PromptTemplate.Default:
                return self._default_system_prompt()
            case PromptTemplate.Enhanced:
                return self._enhanced_system_prompt()
            case PromptTemplate.ContextAware:
                return self._context_aware_system_prompt()

    def generate_conflict_prompt(self, conflict_file: ConflictFile, conflict: ConflictRegion) -> str:
        match self.template:
            case PromptTemplate.Default:
                return self._default_conflict_prompt(conflict_file, conflict)
            case PromptTemplate.Enhanced:
                return self._enhanced_conflict_prompt(conflict_file, conflict)
            case PromptTemplate.ContextAware:
                return self._context_aware_conflict_prompt(conflict_file, conflict)

    def generate_file_prompt(self, conflict_file: ConflictFile) -> str:
        match self.template:
            case PromptTemplate.Default:
                return self._default_file_prompt(conflict_file)
            case PromptTemplate.Enhanced:
                return self._enhanced_file_prompt(conflict_file)
            case PromptTemplate.ContextAware:
                return self._context_aware_file_prompt(conflict_file)

    def _default_system_prompt(self) -> str:
        return (
            "You are an expert software developer helping to resolve merge conflicts "
            "described with Tonic semantic markers (left vs right, added/deleted/both). "
            "Analyze the provided regions and resolve them in a way that preserves the intent "
            "of both sides whenever possible. Consider the whole file and follow existing style. "
            "Provide clean resolved content without conflict markers."
        )

    def _enhanced_system_prompt(self) -> str:
        return (
            "You are an expert software developer specializing in Tonic-style merge conflicts. "
            "Your task is to analyze regions labeled with left/right and conflict kinds "
            "(added left, deleted right, etc.) and resolve them with semantic understanding.\n\n"
            "1. Interpret both sides by meaning, not only by text diff\n"
            "2. Preserve functional changes from both sides when possible\n"
            "3. Prefer correctness and program logic over naive text merging\n"
            "4. Follow the codebase style\n"
            "5. Consider edge cases and side effects\n"
            "6. If sides are incompatible, choose reasonably and explain only if asked\n\n"
            "Provide only cleanly resolved code without conflict markers unless requested."
        )

    def _context_aware_system_prompt(self) -> str:
        return (
            "You are an expert software developer specializing in Tonic merge conflicts. "
            "Compare left and right to BASE when provided; use surrounding file context. "
            "Preserve intent from both sides, prioritize correctness, follow project style, "
            "combine complementary edits, and when BASE is present use it to understand "
            "what each side changed. Provide only resolved code without markers unless asked."
        )

    def _default_conflict_prompt(self, conflict_file: ConflictFile, conflict: ConflictRegion) -> str:
        kind = f" ({conflict.conflict_kind})" if conflict.conflict_kind else ""
        return (
            f"I need help resolving a Tonic merge conflict in the file: {conflict_file.path}\n\n"
            f"The file contains a conflict between line {conflict.start_line} and "
            f"{conflict.end_line}{kind}:\n\n"
            f"LEFT ({conflict_file.left_label}):\n```\n{conflict.left_content}```\n\n"
            f"RIGHT ({conflict_file.right_label}):\n```\n{conflict.right_content}```\n\n"
            "Resolve this conflict and provide only the final content that should replace the "
            "conflicting region. Preserve both sides' intent when possible. "
            "Do not include Tonic or Git conflict markers in your response."
        )

    def _enhanced_conflict_prompt(self, conflict_file: ConflictFile, conflict: ConflictRegion) -> str:
        kind = conflict.conflict_kind or "unspecified"
        ft = determine_file_type(conflict_file.path)
        return (
            f"I need help resolving a Tonic merge conflict in the file: {conflict_file.path}\n\n"
            f"CONFLICT DETAILS:\n"
            f"- Location: Lines {conflict.start_line} to {conflict.end_line}\n"
            f"- Tonic kind: {kind}\n"
            f"- File type: {ft}\n\n"
            f"LEFT ({conflict_file.left_label}):\n```\n{conflict.left_content}```\n\n"
            f"RIGHT ({conflict_file.right_label}):\n```\n{conflict.right_content}```\n\n"
            "CONFLICT ANALYSIS:\n"
            "Analyze semantic differences. Look for complementary changes, incompatible edits, "
            "and what each side is trying to accomplish.\n\n"
            "RESOLUTION:\n"
            "Provide ONLY the final resolved code for this region. No markers or explanations."
        )

    def _context_aware_conflict_prompt(self, conflict_file: ConflictFile, conflict: ConflictRegion) -> str:
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
        return (
            f"I need help resolving a Tonic merge conflict in the file: {conflict_file.path}\n\n"
            f"CONFLICT DETAILS:\n"
            f"- Lines {conflict.start_line} to {conflict.end_line}\n"
            f"- Kind: {kind}\n"
            f"- File type: {ft}\n\n"
            f"{base_section}{ctx_section}"
            f"LEFT ({conflict_file.left_label}):\n```\n{conflict.left_content}```\n\n"
            f"RIGHT ({conflict_file.right_label}):\n```\n{conflict.right_content}```\n\n"
            "Provide ONLY the final resolved code for this region, integrating with context."
        )

    def _default_file_prompt(self, conflict_file: ConflictFile) -> str:
        parts = []
        for i, c in enumerate(conflict_file.conflicts):
            parts.append(
                f"CONFLICT {i + 1}:\nBetween lines {c.start_line} and {c.end_line}\n"
                f"LEFT:\n```\n{c.left_content}```\n"
                f"RIGHT:\n```\n{c.right_content}```\n\n"
            )
        body = "".join(parts)
        return (
            f"I need help resolving Tonic merge conflicts in the file: {conflict_file.path}\n\n"
            f"The file has {len(conflict_file.conflicts)} conflict(s):\n\n{body}"
            "Provide the entire resolved file content. Preserve intent from both sides when possible. "
            "Do not include conflict markers in your response."
        )

    def _enhanced_file_prompt(self, conflict_file: ConflictFile) -> str:
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
        return (
            f"I need help resolving Tonic merge conflicts in: {conflict_file.path}\n\n"
            f"FILE DETAILS:\n- File type: {ft}\n- Conflicts: {len(conflict_file.conflicts)}\n\n"
            f"CONFLICTS:\n\n{''.join(parts)}"
            "Provide ONLY the complete resolved file. No markers or commentary."
        )

    def _context_aware_file_prompt(self, conflict_file: ConflictFile) -> str:
        ft = determine_file_type(conflict_file.path)
        parts = []
        for i, c in enumerate(conflict_file.conflicts):
            base_sec = (
                f"BASE:\n```\n{c.base_content}```\n" if c.base_content.strip() else ""
            )
            parts.append(
                f"CONFLICT {i + 1}:\n"
                f"- Lines {c.start_line} to {c.end_line}\n"
                f"{base_sec}"
                f"LEFT:\n```\n{c.left_content}```\n"
                f"RIGHT:\n```\n{c.right_content}```\n\n"
            )
        return (
            f"I need help resolving Tonic merge conflicts in: {conflict_file.path}\n\n"
            f"FILE DETAILS:\n- File type: {ft}\n- Conflicts: {len(conflict_file.conflicts)}\n\n"
            f"CONFLICTS:\n\n{''.join(parts)}"
            "Compare to BASE per region when present; produce one coherent resolved file."
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


def prompt_template_from_env() -> PromptTemplate:
    raw = (env_config.get_prompt_template_name() or "enhanced").lower().strip()
    if raw == "default":
        return PromptTemplate.Default
    if raw in ("context-aware", "context_aware", "contextaware"):
        return PromptTemplate.ContextAware
    return PromptTemplate.Enhanced
