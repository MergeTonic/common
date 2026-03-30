from tonic.hydration import (
    agentic_prompt_section,
    build_code_search_execute_step_user_prompt,
    format_agentic_prompt_template,
    load_agentic_prompt_bundle,
    load_hydration_prompt_bundle,
    question_generation_user_prompt,
    synthesis_user_prompt,
)


def test_load_hydration_prompt_bundle_has_expected_sections():
    bundle = load_hydration_prompt_bundle()
    assert bundle["schema_version"] == 1
    assert "question_generation" in bundle
    assert "synthesis" in bundle


def test_hydration_prompt_templates_format_expected_fields():
    q = question_generation_user_prompt(
        repo_root="/repo",
        scope="src/**",
        downstream_task="map auth intent",
        branch_intents="branch=left: preserve auth flow",
        hydrated_context="module=auth",
        max_questions="3",
        prior_questions="(none)",
    )
    assert "Plan up to 3 named retrieval questions" in q
    assert "Downstream task: map auth intent" in q

    s = synthesis_user_prompt(
        repo_root="/repo",
        path="src/app.ts",
        intent_spec="intent spec",
        question_slots="q1",
        retrieval_bundles="rb1",
        fuzzy_alignment="fa1",
    )
    assert "Conflict path: src/app.ts" in s


def test_hydration_prompt_templates_support_prompt_profiles():
    q = question_generation_user_prompt(
        repo_root="/repo",
        scope="src/**",
        downstream_task="map auth intent",
        branch_intents="branch=left: preserve auth flow",
        hydrated_context="module=auth",
        max_questions="3",
        prior_questions="(none)",
        prompt_profile="compact",
    )
    assert "Plan up to 3 named retrieval questions" in q or "Downstream task: map auth intent" in q


def test_load_agentic_prompt_bundle_has_expected_sections():
    bundle = load_agentic_prompt_bundle()
    assert bundle["schema_version"] == 1
    assert "base" in bundle
    assert "code_search" in bundle
    assert "bcp_search" in bundle


def test_agentic_prompt_formatter_preserves_unknown_placeholders():
    section = agentic_prompt_section("base")
    assert "generate_plan" in section
    rendered = format_agentic_prompt_template(
        "Plan {count} steps for {scope} and keep {unknown} unchanged",
        count="3",
        scope="src/**",
    )
    assert rendered == "Plan 3 steps for src/** and keep {unknown} unchanged"


def test_build_code_search_execute_step_user_prompt_renders_history():
    rendered = build_code_search_execute_step_user_prompt(
        context={
            "query": "How does auth work?",
            "plan": [{"id": "1", "title": "Find auth entrypoints"}],
            "history": [
                {
                    "stepId": "1",
                    "summary": "Located auth entrypoint",
                    "chunks": [
                        {
                            "filePath": "src/auth.ts",
                            "symbol": "resolveAuth",
                            "snippet": "export function resolveAuth...",
                        }
                    ],
                    "insights": ["resolveAuth delegates to policy engine"],
                }
            ],
        },
        step={"id": "2", "title": "Trace call graph", "description": "Follow resolveAuth callers"},
    )
    assert "The original user query: How does auth work?" in rendered
    assert "Relevant code:\n  - src/auth.ts (resolveAuth)" in rendered
    assert "Insights: resolveAuth delegates to policy engine" in rendered
