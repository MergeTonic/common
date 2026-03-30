from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import shutil
import threading
from types import SimpleNamespace

import tonic.hydration.chroma_client as chroma_client_module
from tonic.hydration import (
    get_hydration_chroma_collection,
    parse_hydration_chroma_url,
    probe_hydration_chroma_heartbeat,
    probe_hydration_runtime_readiness,
    resolve_hydration_runtime_config,
    runtime_mode_to_backend,
)


class _HeartbeatHandler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path == "/api/v2/heartbeat":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):  # noqa: A003
        return


def _start_server():
    server = HTTPServer(("127.0.0.1", 0), _HeartbeatHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


TMP = Path("tests/_tmp_chroma_client")


def _workspace_tmp(name: str) -> Path:
    target = TMP / name
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True, exist_ok=True)
    return target


def test_resolve_hydration_runtime_config_preserves_requested_mode():
    cfg = resolve_hydration_runtime_config(
        Path("tests/_tmp_runtime/config_modes"),
        {"TONIC_CHROMA_MODE": "persistent"},
    )
    assert cfg.mode == "persistent"
    assert runtime_mode_to_backend(cfg.mode) == "chroma-persistent"


def test_parse_hydration_chroma_url_normalizes_connection_fields():
    parsed = parse_hydration_chroma_url("https://localhost:8443/api")
    assert parsed.host == "localhost"
    assert parsed.port == 8443
    assert parsed.ssl is True
    assert parsed.origin == "https://localhost:8443"


def test_probe_hydration_chroma_heartbeat_hits_expected_path():
    server = _start_server()
    try:
        config = resolve_hydration_runtime_config(
            Path("tests/_tmp_runtime/heartbeat"),
            {
                "TONIC_CHROMA_URL": f"http://127.0.0.1:{server.server_port}",
                "TONIC_CHROMA_MODE": "http",
            },
        )
        result = probe_hydration_chroma_heartbeat(config)
        assert result.ok is True
        assert result.status == 200
    finally:
        server.shutdown()


def test_probe_hydration_runtime_readiness_skips_non_http_modes():
    result = probe_hydration_runtime_readiness(
        str(Path("tests/_tmp_runtime/runtime_memory")),
        {"TONIC_CHROMA_MODE": "memory"},
    )
    assert result is None


def test_persistent_mode_reloads_collection_state(monkeypatch):
    stores: dict[str, dict[str, dict[str, object]]] = {}

    class FakeCollection:
        def __init__(self, store: dict[str, dict[str, object]]) -> None:
            self.store = store

        def upsert(self, *, ids, documents, embeddings, metadatas):
            for idx, doc_id in enumerate(ids):
                self.store[doc_id] = {
                    "document": documents[idx],
                    "embedding": embeddings[idx],
                    "metadata": metadatas[idx],
                }

        def get(self, *, ids, include):
            rows = [self.store[item] for item in ids if item in self.store]
            return {
                "ids": [item for item in ids if item in self.store],
                "documents": [row["document"] for row in rows],
                "metadatas": [row["metadata"] for row in rows],
                "embeddings": [row["embedding"] for row in rows],
            }

    class FakePersistentClient:
        def __init__(self, *, path: str) -> None:
            self.path = path

        def get_or_create_collection(self, *, name: str, metadata):
            store = stores.setdefault(self.path, {}).setdefault(name, {})
            return FakeCollection(store)

    fake_module = SimpleNamespace(
        PersistentClient=FakePersistentClient,
        HttpClient=lambda **kwargs: None,
        EphemeralClient=lambda: None,
    )
    monkeypatch.setattr(chroma_client_module, "load_hydration_chromadb", lambda: fake_module)
    repo_root = _workspace_tmp("persistent_reload")
    config = resolve_hydration_runtime_config(
        repo_root,
        {
            "TONIC_CHROMA_MODE": "persistent",
            "TONIC_CHROMA_PERSIST_PATH": str(repo_root / "persist"),
        },
    )
    collection_one = get_hydration_chroma_collection(config)
    collection_one.upsert(
        ids=["doc-1"],
        documents=["alpha"],
        embeddings=[[1.0, 0.0]],
        metadatas=[{"path": "src/app.ts"}],
    )
    collection_two = get_hydration_chroma_collection(config)
    loaded = collection_two.get(ids=["doc-1"], include=["documents", "metadatas", "embeddings"])
    assert loaded["ids"] == ["doc-1"]
    assert loaded["documents"] == ["alpha"]
