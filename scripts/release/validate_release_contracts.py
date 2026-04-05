#!/usr/bin/env python3
import hashlib
import json
import re
from pathlib import Path

import tomllib


def _read_json(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _read_toml(path: str) -> dict:
    return tomllib.loads(Path(path).read_text(encoding="utf-8"))


def _extract_default(action_text: str, key: str) -> str:
    pattern = rf"^\s*{re.escape(key)}:\s*\n(?:.*\n)*?\s*default:\s*\"?([^\n\"]+)\"?"
    match = re.search(pattern, action_text, re.MULTILINE)
    if not match:
        raise ValueError(f"missing default for {key}")
    return match.group(1).strip()


def _read_release_targets() -> dict:
    return _read_json("release-targets.json")


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def _validate_hydration_schemas(failures: list[str]) -> None:
    """Ensure hydration JSON Schema files exist, parse, and declare expected artifact properties."""
    checks: list[tuple[str, list[str]]] = [
        ("schemas/tonic-ast-hydration.v1.json", ["schema", "version", "tool", "repo_root", "matches"]),
        ("schemas/tonic-hydration-run.v1.json", ["schema", "version", "run_id", "status", "exit_code"]),
        (
            "schemas/tonic-hydration-intent-bootstrap.v1.json",
            ["schema", "version", "left_intent", "right_intent", "sources"],
        ),
        ("schemas/tonic-question-refinement.v1.json", ["schema", "version", "mode"]),
        ("schemas/tonic-conflict-context.v1.json", ["schema", "version", "conflict_regions"]),
        ("schemas/tonic-intent-hydration.v1.json", ["schema", "version", "left_intent", "right_intent"]),
        ("schemas/tonic-code-walk-trace.v1.json", ["schema", "version", "steps"]),
        ("schemas/tonic-retrieval-hydration.v1.json", ["schema", "version", "hits"]),
        (
            "schemas/tonic-memory-vector-index.v1.json",
            ["schema", "version", "embedding_fingerprint", "records"],
        ),
    ]
    for rel, prop_keys in checks:
        p = Path(rel)
        if not p.is_file():
            failures.append(f"missing hydration schema: {rel}")
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            failures.append(f"invalid JSON in {rel}: {e}")
            continue
        if not isinstance(data, dict):
            failures.append(f"hydration schema root must be object: {rel}")
            continue
        props = data.get("properties")
        if not isinstance(props, dict):
            failures.append(f"hydration schema {rel} must define object properties")
            continue
        for k in prop_keys:
            if k not in props:
                failures.append(f"hydration schema {rel} missing properties.{k}")


def _validate_weave_schemas(failures: list[str]) -> None:
    """Ensure weave JSON Schema files exist, parse, and declare expected top-level properties."""
    checks: list[tuple[str, list[str]]] = [
        (
            "schemas/tonic-git-manifest.v1.json",
            ["schema", "version", "commit", "paths"],
        ),
        (
            "schemas/tonic-weave-hub-index.v1.json",
            ["schema", "version", "repo_id", "objects"],
        ),
        (
            "schemas/tonic-weave-verify-report.v1.json",
            ["schema", "version", "status", "repo_root", "checks"],
        ),
    ]
    for rel, prop_keys in checks:
        p = Path(rel)
        if not p.is_file():
            failures.append(f"missing weave schema: {rel}")
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            failures.append(f"invalid JSON in {rel}: {e}")
            continue
        if not isinstance(data, dict):
            failures.append(f"weave schema root must be object: {rel}")
            continue
        props = data.get("properties")
        if not isinstance(props, dict):
            failures.append(f"weave schema {rel} must define object properties")
            continue
        for k in prop_keys:
            if k not in props:
                failures.append(f"weave schema {rel} missing properties.{k}")


def _rule_files_from_ast_grep_index(text: str) -> list[str]:
    out: list[str] = []
    in_list = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("ruleFiles:"):
            in_list = True
            continue
        if in_list:
            m = re.match(r"^\s*-\s*(\S+)", line)
            if m:
                out.append(m.group(1))
            elif stripped and not line[0].isspace():
                break
    return out


def _validate_ast_grep_rulepack_mirror(failures: list[str]) -> None:
    idx_path = Path("packages/tonic-core/rules/ast-grep/index.yaml")
    if not idx_path.is_file():
        failures.append("missing packages/tonic-core/rules/ast-grep/index.yaml")
        return
    files = _rule_files_from_ast_grep_index(idx_path.read_text(encoding="utf-8"))
    if not files:
        failures.append("ast-grep index.yaml must list ruleFiles")
        return
    ts_dir = Path("packages/tonic-core/rules/ast-grep")
    py_dir = Path("merge-tonic-lib/tonic/data/ast_grep_rules")
    for name in files:
        ts_f = ts_dir / name
        py_f = py_dir / name
        if not ts_f.is_file():
            failures.append(f"ast-grep rulepack missing TS file: {ts_f}")
            continue
        if not py_f.is_file():
            failures.append(
                f"ast-grep rulepack missing Py mirror: {py_f} (copy from packages/tonic-core/rules/ast-grep/)"
            )
            continue
        if ts_f.read_bytes() != py_f.read_bytes():
            failures.append(f"ast-grep rule drift: {name} differs between TS rulepack and merge-tonic-lib mirror")


def _validate_hydration_prompt_embeds(failures: list[str]) -> None:
    core = Path("packages/tonic-core/hydration-prompts/embed.json")
    py_data = Path("merge-tonic-lib/tonic/data/hydration_prompts_embed.json")
    for p, label in ((core, "tonic-core embed.json"), (py_data, "merge-tonic-lib hydration_prompts_embed.json")):
        if not p.is_file():
            failures.append(f"missing {label}: {p} (run: python scripts/generate_prompt_bundle.py)")
            return
    if core.read_bytes() != py_data.read_bytes():
        failures.append(
            "hydration embed.json drift: packages/tonic-core/hydration-prompts/embed.json must match "
            "merge-tonic-lib/tonic/data/hydration_prompts_embed.json (run: python scripts/generate_prompt_bundle.py)"
        )


def _validate_ai_prompt_bundle_copies(failures: list[str]) -> None:
    canonical = Path("agents/shared-tonic-ai-prompts/prompts.v1.json")
    node_copy = Path("agents/github-action-agent-node/src/data/aiPrompts.v1.json")
    py_copy = Path("agents/github-action-agent/src/tonic_agent/data/ai_prompts.v1.json")
    if not canonical.is_file():
        failures.append("missing agents/shared-tonic-ai-prompts/prompts.v1.json")
        return
    want = _sha256_file(canonical)
    for label, p in (
        ("node agent aiPrompts.v1.json", node_copy),
        ("python agent ai_prompts.v1.json", py_copy),
    ):
        if not p.is_file():
            failures.append(f"missing {label}: {p} (run: python scripts/sync_agent_ai_prompts.py)")
            continue
        got = _sha256_file(p)
        if got != want:
            failures.append(
                f"AI prompt bundle drift: {label} does not match canonical "
                f"(run: python scripts/sync_agent_ai_prompts.py)"
            )


def main() -> int:
    failures: list[str] = []
    ts_cli_version = _read_json("packages/tonic-core/package.json")["version"]
    js_action_version = _read_json("agents/github-action-agent-node/package.json")["version"]
    py_cli_version = _read_toml("merge-tonic-lib/pyproject.toml")["project"]["version"]
    py_action_version = _read_toml("agents/github-action-agent/pyproject.toml")["project"]["version"]

    py_action_yml = Path("agents/github-action-agent/action.yml").read_text(encoding="utf-8")
    js_action_yml = Path("agents/github-action-agent-node/action.yml").read_text(encoding="utf-8")

    if _extract_default(py_action_yml, "tonic_version") != py_cli_version:
        failures.append("python action tonic_version default must match merge-tonic version")
    if _extract_default(py_action_yml, "tonic_github_agent_version") != py_action_version:
        failures.append("python action tonic_github_agent_version default must match py-action package")
    if _extract_default(js_action_yml, "tonic_github_agent_version") != js_action_version:
        failures.append("node action tonic_github_agent_version default must match js-action package")

    js_pkg = _read_json("agents/github-action-agent-node/package.json")
    if js_pkg["dependencies"]["@mergetonic/core"].lstrip("^") != ts_cli_version:
        failures.append("node action dependency @mergetonic/core must track ts cli/core version")

    _validate_ai_prompt_bundle_copies(failures)
    _validate_hydration_schemas(failures)
    _validate_weave_schemas(failures)
    _validate_ast_grep_rulepack_mirror(failures)
    _validate_hydration_prompt_embeds(failures)

    release_targets = _read_release_targets()
    allowed_version_keys = {"ts_cli", "js_action", "vsmt", "py_cli", "py_action", "hf_weave"}
    expected_source_dir = {
        "vsmt": "extensions/tonic-conflict-resolver",
        "js-action": "agents/github-action-agent-node",
        "py-action": "agents/github-action-agent",
        "tsmt": "packages/tonic-core",
        "mtpy": "merge-tonic-lib",
        "hf-weave": "packages/hf-weave",
        ".github": ".github",
    }
    for target in release_targets.get("targets", []):
        target_id = target.get("id", "")
        release_types = set(target.get("release_types", []))
        selectable = target.get("selectable", True)
        if target_id == "common":
            if selectable is not False:
                failures.append("common target must set selectable=false")
            if release_types:
                failures.append("common target must not define releasable release_types")
            continue

        if "repo_sync" in release_types:
            source_dir = target.get("source_dir", "")
            template_dir = target.get("template_dir", "")
            change_paths = target.get("paths", [])
            if not source_dir:
                failures.append(f"{target_id} must define source_dir when repo_sync is enabled")
            if source_dir and source_dir != expected_source_dir.get(target_id):
                failures.append(f"{target_id} source_dir must match expected mapping")
            if source_dir and not Path(source_dir).exists():
                failures.append(f"{target_id} source_dir does not exist: {source_dir}")
            if not template_dir:
                failures.append(f"{target_id} must define template_dir when repo_sync is enabled")
            if template_dir and not Path(template_dir).exists():
                failures.append(f"{target_id} template_dir does not exist: {template_dir}")
            if not isinstance(change_paths, list) or not change_paths:
                failures.append(f"{target_id} must define non-empty paths for change detection")
            else:
                expected_source_pattern = f"{source_dir}/**" if source_dir else ""
                expected_template_pattern = f"{template_dir}/**" if template_dir else ""
                if expected_source_pattern and expected_source_pattern not in change_paths:
                    failures.append(
                        f"{target_id} paths must include source scope pattern: {expected_source_pattern}"
                    )
                if expected_template_pattern and expected_template_pattern not in change_paths:
                    failures.append(
                        f"{target_id} paths must include template scope pattern: {expected_template_pattern}"
                    )

            sync_policy = target.get("sync_policy")
            if not isinstance(sync_policy, dict):
                failures.append(f"{target_id} must define sync_policy object when repo_sync is enabled")
            else:
                managed_paths = sync_policy.get("managed_paths")
                preserve_paths = sync_policy.get("preserve_paths")
                if not isinstance(managed_paths, list) or len(managed_paths) == 0:
                    failures.append(f"{target_id} sync_policy.managed_paths must be a non-empty list")
                if not isinstance(preserve_paths, list) or len(preserve_paths) == 0:
                    failures.append(f"{target_id} sync_policy.preserve_paths must be a non-empty list")

        if ("npm" in release_types or "pypi" in release_types or "vsix" in release_types) and not target.get("version_key"):
            failures.append(f"{target_id} must define version_key for publishable targets")
        version_key = target.get("version_key", "")
        if version_key and version_key not in allowed_version_keys:
            failures.append(f"{target_id} version_key '{version_key}' is not supported")

    if failures:
        for message in failures:
            print(f"ERROR: {message}")
        return 1

    print("release contracts validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
