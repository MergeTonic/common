"""CLI parity smoke tests (merge-tonic script)."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

FIX = Path(__file__).resolve().parent / "fixtures" / "cli"
TMP = Path(__file__).resolve().parent / "_tmp_cli"


def _workspace_tmp(name: str) -> Path:
    target = TMP / name
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True, exist_ok=True)
    return target


def _run(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tonic.cli", *args],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
    )


def test_merge_stdout_matches_snapshot():
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    cp = _run("merge", "--left", str(left), "--right", str(right))
    out = cp.stdout.strip()
    assert "<<<<<<< begin" in out
    assert ">>>>>>> end conflict" in out


def test_merge_short_flags_work() -> None:
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    cp = _run("m", "-l", str(left), "-r", str(right))
    assert "<<<<<<< begin" in cp.stdout


def test_report_json_schema_shape():
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    cp = _run("report", "--left", str(left), "--right", str(right), "--path", "demo.txt")
    data = json.loads(cp.stdout)
    assert data["schema"] == "merge-tonic-report"
    assert len(data["files"]) == 1
    f0 = data["files"][0]
    assert f0["path"] == "demo.txt"
    assert "markers_present" in f0


def test_report_blame_fields() -> None:
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    cp = _run(
        "report",
        "--left",
        str(left),
        "--right",
        str(right),
        "--path",
        "demo.txt",
        "--blame",
        "--left-commit-id",
        "abc123",
        "--right-commit-id",
        "def456",
    )
    data = json.loads(cp.stdout)
    f0 = data["files"][0]
    assert f0["left_commit_id"] == "abc123"
    assert f0["right_commit_id"] == "def456"
    if f0["conflict_regions"]:
        r0 = f0["conflict_regions"][0]
        assert r0["left_commit_ids"] == ["abc123"]
        assert r0["right_commit_ids"] == ["def456"]


def test_report_positional_files_work() -> None:
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    cp = _run("r", str(left), str(right), "-p", "demo.txt")
    data = json.loads(cp.stdout)
    assert data["schema"] == "merge-tonic-report"


def test_conflicts_parse_empty():
    cp = _run("conflicts", "--file", str(FIX / "left.txt"))
    data = json.loads(cp.stdout)
    assert data["blocks"] == []
    assert data["warnings"] == []


def test_apply_positional_file_works() -> None:
    left = FIX / "left.txt"
    right = FIX / "right.txt"
    merged = _run("merge", "-l", str(left), "-r", str(right)).stdout
    marker = _workspace_tmp("apply_positional") / "m.txt"
    marker.write_text(merged, encoding="utf-8")
    cp = _run("a", str(marker))
    data = json.loads(cp.stdout)
    assert "clean_lines" in data


def test_git_hydrate_intents_optional_ai_check_memory_mode() -> None:
    repo = _workspace_tmp("hydrate_check")
    out_path = repo / "result.json"
    env = {**os.environ, "TONIC_CHROMA_MODE": "memory", "MERGETONIC_LICENSE_ACCEPTED": "1"}
    cp = _run(
        "git",
        "--repo",
        str(repo),
        "hydrate-intents",
        "--check-optional-ai",
        "--out-json",
        str(out_path),
        env=env,
    )
    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert cp.returncode == 0
    assert data["ok"] is True
    assert data["optional_dependency_group"] == "ai"


def test_git_hydrate_intents_scaffold_writes_run_artifacts() -> None:
    repo = _workspace_tmp("hydrate_scaffold")
    out_path = repo / "result.json"
    env = {**os.environ, "TONIC_CHROMA_MODE": "memory", "MERGETONIC_LICENSE_ACCEPTED": "1"}
    cp = _run(
        "git",
        "--repo",
        str(repo),
        "hydrate-intents",
        "--vendoring-scaffold",
        "--out-json",
        str(out_path),
        env=env,
    )
    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert cp.returncode == 0
    assert data["hydration_skipped"] is True
    assert data["skip_reason"] == "not_implemented"
    retrieval_path = Path(data["pipeline_run"]["artifacts"]["retrieval_path"])
    transcript_path = Path(data["pipeline_run"]["artifacts"]["llm_transcript_path"])
    assert retrieval_path.is_file()
    assert transcript_path.is_file()


def test_git_hydrate_intents_runs_vendored_deterministic_retrieval_pipeline() -> None:
    repo = _workspace_tmp("hydrate_runtime")
    (repo / "feature.py").write_text("def hydrated_feature() -> bool:\n    return True\n", encoding="utf-8")
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "t@e.st"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    subprocess.run(["git", "add", "feature.py"], cwd=repo, check=True)
    out_path = repo / "result.json"
    env = {**os.environ, "TONIC_CHROMA_MODE": "memory", "MERGETONIC_LICENSE_ACCEPTED": "1"}
    cp = _run(
        "git",
        "--repo",
        str(repo),
        "hydrate-intents",
        "--out-json",
        str(out_path),
        "--intent-text",
        "map feature hydration context",
        "--max-questions",
        "2",
        "--query-top-k",
        "3",
        env=env,
    )
    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert cp.returncode == 0
    assert data["hydration_skipped"] is False
    assert isinstance(data["retrieval_bundles"], list)
    assert len(data["retrieval_bundles"]) >= 1
    assert any(
        candidate.get("node_kind") == "function" and candidate.get("symbol") == "hydrated_feature"
        for bundle in data["retrieval_bundles"]
        for candidate in bundle.get("ast_candidates", [])
    )
    assert isinstance(data["tags_added"], list)
    assert len(data["tags_added"]) >= 1
    assert isinstance(data["fuzzy_alignment"], list)
    assert len(data["fuzzy_alignment"]) >= 1
    assert len(data["hydration_cycle"]["nodes"]) >= 1
    assert data["hydration_cycle"]["total_cycles"] >= 1
    assert len(data["hydration_cycle"]["cycles"]) == data["hydration_cycle"]["total_cycles"]
    assert len(data["metadata_consolidation"]["paths_ranked"]) >= 1
    assert len(data["metadata_consolidation"]["candidate_tags"]) >= 1
    assert data["pipeline_run"]["run_status"] == "completed"
    retrieval_path = Path(data["pipeline_run"]["artifacts"]["retrieval_path"])
    hydration_cycle_path = Path(data["pipeline_run"]["artifacts"]["hydration_cycle_path"])
    consolidation_path = Path(data["pipeline_run"]["artifacts"]["metadata_consolidation_path"])
    result_path = Path(data["pipeline_run"]["artifacts"]["hydration_result_path"])
    assert retrieval_path.is_file()
    assert hydration_cycle_path.is_file()
    assert consolidation_path.is_file()
    assert result_path.is_file()


def test_git_hydrate_intents_supports_intent_spec_and_rejects_malformed_spec() -> None:
    repo = _workspace_tmp("hydrate_intent_spec")
    (repo / "main.ts").write_text("export const x = 1;\n", encoding="utf-8")
    valid_spec = repo / "intent-spec.json"
    valid_spec.write_text(
        json.dumps(
            {
                "schema": "tonic-intent-spec",
                "intents": [{"id": "intent-auth", "description": "stabilize auth flow"}],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    out_path = repo / "valid.json"
    env = {**os.environ, "TONIC_CHROMA_MODE": "memory", "MERGETONIC_LICENSE_ACCEPTED": "1"}
    cp = _run(
        "git",
        "--repo",
        str(repo),
        "hydrate-intents",
        "--out-json",
        str(out_path),
        "--intent-spec",
        str(valid_spec),
        env=env,
    )
    assert cp.returncode == 0
    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert len(data["branch_intents"]["branch_intents"]) >= 1
    assert data["branch_intents"]["branch_intents"][0]["source_kind"] == "file"

    bad_spec = repo / "bad-intent-spec.json"
    bad_spec.write_text("{bad json", encoding="utf-8")
    bad_out = repo / "bad.json"
    cp_bad = subprocess.run(
        [
            sys.executable,
            "-m",
            "tonic.cli",
            "git",
            "--repo",
            str(repo),
            "hydrate-intents",
            "--out-json",
            str(bad_out),
            "--intent-spec",
            str(bad_spec),
        ],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
    )
    assert cp_bad.returncode == 1
    bad_payload = json.loads(bad_out.read_text(encoding="utf-8"))
    assert "Failed to parse --intent-spec" in str(bad_payload.get("error", ""))


def test_git_hydrate_intents_scope_dry_run_and_log_llm() -> None:
    repo = _workspace_tmp("hydrate_scope_dryrun")
    (repo / "src").mkdir(parents=True, exist_ok=True)
    (repo / "docs").mkdir(parents=True, exist_ok=True)
    (repo / "src" / "focused.ts").write_text(
        "export function focused_scope() { return true; }\n",
        encoding="utf-8",
    )
    (repo / "docs" / "ignored.md").write_text("ignored\n", encoding="utf-8")
    out_path = repo / "result.json"
    llm_path = repo / "custom-llm.jsonl"
    env = {**os.environ, "TONIC_CHROMA_MODE": "memory", "MERGETONIC_LICENSE_ACCEPTED": "1"}
    cp = _run(
        "git",
        "--repo",
        str(repo),
        "hydrate-intents",
        "--out-json",
        str(out_path),
        "--scope",
        "src/**",
        "--dry-run",
        "--log-llm",
        str(llm_path),
        env=env,
    )
    assert cp.returncode == 0
    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert all(
        hit.get("path", "").startswith("src/")
        for bundle in data.get("retrieval_bundles", [])
        for hit in bundle.get("vector_hits", [])
    )
    assert data["metadata"]["dry_run"] is True
    assert data["metadata"]["scope"] == "src/**"
    assert Path(data["pipeline_run"]["artifacts"]["llm_transcript_path"]).resolve() == llm_path.resolve()
    assert llm_path.is_file()
    assert not Path(data["pipeline_run"]["artifacts"]["index_state_path"]).is_file()


def test_git_hydrate_intents_emits_multi_cycle_records_with_narrowed_targets() -> None:
    repo = _workspace_tmp("hydrate_multicycle")
    (repo / "src").mkdir(parents=True, exist_ok=True)
    (repo / "src" / "auth.ts").write_text(
        "export function resolveAuth(user: string): string {\n  return user;\n}\n\nexport function authPolicy(): string {\n  return resolveAuth('a');\n}\n",
        encoding="utf-8",
    )
    out_path = repo / "result.json"
    env = {**os.environ, "TONIC_CHROMA_MODE": "memory", "MERGETONIC_LICENSE_ACCEPTED": "1"}
    cp = _run(
        "git",
        "--repo",
        str(repo),
        "hydrate-intents",
        "--out-json",
        str(out_path),
        "--max-questions",
        "5",
        "--query-top-k",
        "3",
        env=env,
    )
    assert cp.returncode == 0
    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert data["hydration_cycle"]["total_cycles"] >= 1
    cycle_one_targets = data["hydration_cycle"]["cycles"][0]["targets"]
    assert any(target.get("level") == "branch" for target in cycle_one_targets)
    if data["hydration_cycle"]["total_cycles"] >= 2:
        cycle_two_targets = data["hydration_cycle"]["cycles"][1]["targets"]
        assert any(target.get("level") != "branch" for target in cycle_two_targets)
    else:
        assert data["hydration_cycle"]["stop_reason"] in {
            "no_new_targets",
            "no_new_evidence",
            "max_cycles",
            "max_total_questions",
            "max_total_chunks",
        }
    questions = [
        slot.get("question", "")
        for cycle in data["hydration_cycle"]["cycles"]
        for slot in cycle.get("question_slots", [])
    ]
    normalized = [question.lower().strip() for question in questions if question.strip()]
    assert len(set(normalized)) == len(normalized)


@pytest.mark.skipif(
    subprocess.run(["git", "--version"], capture_output=True).returncode != 0,
    reason="git not available",
)
def test_merge_positional_branch_helper() -> None:
    repo = _workspace_tmp("branch_helper") / "r"
    repo.mkdir(exist_ok=True)
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "t@e.st"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=repo, check=True)
    subprocess.run(["git", "config", "commit.gpgsign", "false"], cwd=repo, check=True)
    subprocess.run(["git", "branch", "-M", "main"], cwd=repo, check=True, capture_output=True)

    (repo / "foo.txt").write_text("A\n", encoding="utf-8")
    subprocess.run(["git", "add", "foo.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "base"], cwd=repo, check=True)

    subprocess.run(["git", "checkout", "-b", "dev"], cwd=repo, check=True, capture_output=True)
    (repo / "foo.txt").write_text("C\n", encoding="utf-8")
    subprocess.run(["git", "add", "foo.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "dev"], cwd=repo, check=True)

    subprocess.run(["git", "checkout", "main"], cwd=repo, check=True, capture_output=True)
    (repo / "foo.txt").write_text("B\n", encoding="utf-8")
    subprocess.run(["git", "add", "foo.txt"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "main"], cwd=repo, check=True)
    subprocess.run(["git", "checkout", "dev"], cwd=repo, check=True, capture_output=True)

    cp = subprocess.run(
        [sys.executable, "-m", "tonic.cli", "merge", "main", "dev", "--repo", str(repo)],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert cp.returncode == 0, cp.stderr
    text = (repo / "foo.txt").read_text(encoding="utf-8")
    assert "<<<<<<< begin" in text
