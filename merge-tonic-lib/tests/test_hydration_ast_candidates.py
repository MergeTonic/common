from tonic.hydration import build_hydration_ast_candidates


def test_build_hydration_ast_candidates_promotes_declaration_metadata():
    candidates = build_hydration_ast_candidates(
        [
            {
                "code": "export class AuthService {\n  resolve() {}\n}\n",
                "file_path": "src/auth.ts",
                "chunk_id": "chunk-auth",
                "source": "hybrid",
                "score": 0.82,
                "symbol": "AuthService",
                "start_line": 1,
                "end_line": 3,
            },
            {
                "code": "export function resolve_auth() {\n  return True\n}\n",
                "file_path": "src/auth.py",
                "chunk_id": "chunk-resolve",
                "source": "symbol",
                "score": 0.91,
                "symbol": "resolve_auth",
                "start_line": 5,
                "end_line": 7,
            },
        ]
    )

    assert any(candidate.ast_node_id == "module:src/auth.ts" and candidate.node_kind == "module" for candidate in candidates)
    assert any(
        candidate.symbol == "AuthService"
        and candidate.node_kind == "class"
        and candidate.start_line == 1
        and candidate.end_line == 3
        for candidate in candidates
    )
    assert any(
        candidate.symbol == "resolve_auth"
        and candidate.node_kind == "function"
        and candidate.rule_id == "symbol-search-v1"
        for candidate in candidates
    )
