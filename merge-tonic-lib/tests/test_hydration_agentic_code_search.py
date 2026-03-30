from pathlib import Path
import shutil

from tonic.hydration import (
    DeterministicFakeEmbedder,
    HydrationIndexer,
    HydrationRepository,
    MemoryVectorIndex,
    run_agentic_code_search_session,
)


def _workspace_tmp(name: str) -> Path:
    root = Path("tests/_tmp_agentic")
    root.mkdir(parents=True, exist_ok=True)
    target = root / name
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True, exist_ok=True)
    return target


def test_run_agentic_code_search_session_executes_multi_step_retrieval():
    repo_root = _workspace_tmp("agentic-session")
    (repo_root / "src").mkdir(parents=True, exist_ok=True)
    (repo_root / "src" / "auth.ts").write_text(
        "export function resolveAuth(user: string): string {\n  return user;\n}\n",
        encoding="utf-8",
    )
    (repo_root / "src" / "index.ts").write_text("export * from './auth';\n", encoding="utf-8")

    index = MemoryVectorIndex("agentic-session")
    embedder = DeterministicFakeEmbedder(dimensions=8)
    indexer = HydrationIndexer(str(repo_root), index, embedder)
    indexer.sync(vector_backend="memory", normative_commit="local")

    repository = HydrationRepository(repo_root)
    session = run_agentic_code_search_session(
        query="How does resolveAuth work?",
        repository=repository,
        index=index,
        embedder=embedder,
        top_k=3,
        max_plan_size=5,
        max_step_iterations=6,
    )

    assert len(session.plan) >= 2
    assert len(session.outcomes) >= 2
    assert len(session.records) >= 1
    assert any(record.file_path == "src/auth.ts" for record in session.records)
    assert ("Evidence points to" in session.answer) or ("No relevant code evidence" in session.answer)


def test_run_agentic_code_search_session_uses_llm_planning_override_and_synthesis():
    repo_root = _workspace_tmp("agentic-session-llm")
    (repo_root / "src").mkdir(parents=True, exist_ok=True)
    (repo_root / "src" / "auth.ts").write_text(
        "export function resolveAuth(user: string): string {\n  return user;\n}\n",
        encoding="utf-8",
    )
    (repo_root / "src" / "index.ts").write_text("export * from './auth';\n", encoding="utf-8")

    index = MemoryVectorIndex("agentic-session-llm")
    embedder = DeterministicFakeEmbedder(dimensions=8)
    indexer = HydrationIndexer(str(repo_root), index, embedder)
    indexer.sync(vector_backend="memory", normative_commit="local")

    class StubHydrationLlmService:
        provider_id = "stub"
        model = "stub-model"

        def __init__(self) -> None:
            self.evaluation_calls = 0

        def generate_json(self, *, messages, schema_name, schema_description):
            del messages, schema_description
            if schema_name == "hydration_code_search_plan":
                return {
                    "steps": [
                        {
                            "id": "llm-hybrid",
                            "title": "Map likely entrypoints",
                            "description": "Run hybrid retrieval first.",
                            "kind": "hybrid",
                        },
                        {
                            "id": "llm-finalize",
                            "title": "Summarize",
                            "description": "Summarize current evidence.",
                            "kind": "finalize",
                            "parents": ["llm-hybrid"],
                        },
                    ]
                }
            if schema_name == "hydration_code_search_evaluation":
                self.evaluation_calls += 1
                if self.evaluation_calls == 1:
                    return {
                        "decision": "override",
                        "steps": [
                            {
                                "id": "llm-symbol",
                                "title": "Resolve declaration",
                                "description": "Find the resolveAuth declaration.",
                                "kind": "symbol",
                                "parents": ["llm-hybrid"],
                                "symbolCandidates": ["resolveAuth"],
                            },
                            {
                                "id": "llm-finalize",
                                "title": "Finalize",
                                "description": "Finalize from symbol evidence.",
                                "kind": "finalize",
                                "parents": ["llm-symbol"],
                            },
                        ],
                    }
                return {"decision": "break", "steps": []}
            if schema_name == "hydration_code_search_final_answer":
                return {
                    "answer": "resolveAuth is implemented in src/auth.ts.",
                    "reason": "Symbol search found the exported declaration in src/auth.ts.",
                }
            raise AssertionError(f"Unexpected schema: {schema_name}")

    llm_service = StubHydrationLlmService()
    llm_events: list[str] = []
    repository = HydrationRepository(repo_root)
    session = run_agentic_code_search_session(
        query="How does resolveAuth work?",
        repository=repository,
        index=index,
        embedder=embedder,
        llm_service=llm_service,
        on_llm_event=lambda event: llm_events.append(f"{event['event']}:{event['schemaName']}"),
        top_k=3,
        max_plan_size=5,
        max_step_iterations=6,
    )

    assert session.answer == "resolveAuth is implemented in src/auth.ts."
    assert session.answer_reason == "Symbol search found the exported declaration in src/auth.ts."
    assert any(step.id == "llm-finalize" and step.status == "cancelled" for step in session.plan)
    assert any(step.id == "llm-symbol" and step.status == "success" for step in session.plan)
    assert any(record.file_path == "src/auth.ts" for record in session.records)
    assert llm_events == [
        "llm_request:hydration_code_search_plan",
        "llm_response:hydration_code_search_plan",
        "llm_request:hydration_code_search_evaluation",
        "llm_response:hydration_code_search_evaluation",
        "llm_request:hydration_code_search_evaluation",
        "llm_response:hydration_code_search_evaluation",
        "llm_request:hydration_code_search_final_answer",
        "llm_response:hydration_code_search_final_answer",
    ]
