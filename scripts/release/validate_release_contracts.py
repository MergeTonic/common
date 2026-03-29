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

    release_targets = _read_release_targets()
    allowed_version_keys = {"ts_cli", "js_action", "vsmt", "py_cli", "py_action"}
    expected_source_dir = {
        "vsmt": "extensions/tonic-conflict-resolver",
        "js-action": "agents/github-action-agent-node",
        "py-action": "agents/github-action-agent",
        "tsmt": "packages/tonic-core",
        "mtpy": "merge-tonic-lib",
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
