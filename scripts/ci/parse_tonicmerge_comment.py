"""Parse @tonicmerge directives from an issue_comment body for workflow wiring.

Writes GitHub Actions outputs: enable_ast_hydration, ast_hydration_subcommand,
intent_pair, hydration_user_query (optional), hydration_question_mode (optional),
ast_hydration_extra_args, ast_hydration_extra_args_chroma (retrieval CLI tokens).
"""

from __future__ import annotations

import os
import re
import sys


def _retrieval_extra_args_from_body(body: str) -> str:
    """Build space-separated hydrate CLI flags for retrieval (may be empty)."""
    parts: list[str] = []
    rb_m = re.search(r"\bretrieval_backend=(chroma|memory)\b", body, re.IGNORECASE)
    if rb_m:
        parts.append("--enable-retrieval")
        parts.append(f"--retrieval-backend {rb_m.group(1).lower()}")
    elif re.search(r"(?<![\w])retrieval(?:=(?:on|true|1))?(?![\w])", body, re.IGNORECASE):
        parts.append("--enable-retrieval")
    return " ".join(parts).strip()


def merge_chroma_service_extra_args(plain: str) -> str:
    """Ensure --enable-retrieval and --retrieval-backend chroma for the gated Chroma service job."""
    s = plain.strip()
    if not s:
        return "--enable-retrieval --retrieval-backend chroma"
    if "--enable-retrieval" not in s:
        s = f"--enable-retrieval {s}".strip()
    if "--retrieval-backend" not in s:
        return f"{s} --retrieval-backend chroma".strip()
    return re.sub(
        r"--retrieval-backend\s+\S+",
        "--retrieval-backend chroma",
        s,
        count=1,
    )


def parse_tonicmerge_body(body: str) -> dict[str, str]:
    """Extract optional flags after a word-boundary @tonicmerge token."""
    if not re.search(r"(?<![\w@])@tonicmerge\b", body):
        return {
            "enable_ast_hydration": "false",
            "ast_hydration_subcommand": "ast-grep-hydrate",
            "ast_hydration_extra_args": "",
            "ast_hydration_extra_args_chroma": "--enable-retrieval --retrieval-backend chroma",
        }
    enable = "false"
    sub = "ast-grep-hydrate"
    if re.search(r"@tonicmerge(?:\s+)hydrate\b", body):
        enable = "true"
        sub = "hydrate"
    intent = ""
    m_intent = re.search(r"\bintent=([^\s]+)", body)
    if m_intent:
        intent = m_intent.group(1).strip()
    q = ""
    m_q = re.search(r'\bq="((?:\\.|[^"\\])*)"', body, re.DOTALL)
    if m_q:
        q = m_q.group(1).replace("\\n", "\n").replace('\\"', '"').replace("\\\\", "\\")
    qm = ""
    m_qm = re.search(r"\bquestion[_-]?mode=(off|on|auto)\b", body, re.IGNORECASE)
    if m_qm:
        qm = m_qm.group(1).lower()
    retrieval_plain = _retrieval_extra_args_from_body(body)
    out: dict[str, str] = {
        "enable_ast_hydration": enable,
        "ast_hydration_subcommand": sub,
        "ast_hydration_extra_args": retrieval_plain,
        "ast_hydration_extra_args_chroma": merge_chroma_service_extra_args(retrieval_plain),
    }
    if intent:
        out["intent_pair"] = intent
    if q:
        out["hydration_user_query"] = q
    if qm:
        out["hydration_question_mode"] = qm
    return out


def _write_github_output(pairs: dict[str, str]) -> None:
    path = os.environ.get("GITHUB_OUTPUT", "").strip()
    if not path:
        return
    with open(path, "a", encoding="utf-8") as fh:
        for k, v in pairs.items():
            if "\n" in v:
                fh.write(f"{k}<<TONICMERGE_EOF\n")
                fh.write(v)
                fh.write("\nTONICMERGE_EOF\n")
            else:
                fh.write(f"{k}={v}\n")


def main() -> None:
    body = os.environ.get("COMMENT_BODY", "")
    parsed = parse_tonicmerge_body(body)
    _write_github_output(parsed)


if __name__ == "__main__":
    main()
    sys.exit(0)
