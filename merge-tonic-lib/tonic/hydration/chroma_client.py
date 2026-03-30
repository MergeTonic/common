"""Vendored Chroma client/runtime helpers for hydration."""

from __future__ import annotations

from dataclasses import dataclass
from types import ModuleType
from urllib.parse import urljoin, urlparse
import urllib.error
import urllib.request

from .errors import HydrationRuntimeError, OptionalAiDependencyError
from .runtime_config import HydrationRuntimeConfig


@dataclass(frozen=True)
class HydrationChromaUrl:
    raw: str
    origin: str
    host: str
    port: int
    ssl: bool
    pathname: str


@dataclass(frozen=True)
class HydrationChromaHeartbeat:
    ok: bool
    heartbeat_url: str
    status: int | None = None
    error: str = ""


def load_hydration_chromadb() -> ModuleType:
    try:
        import chromadb  # type: ignore
    except ImportError as exc:
        raise OptionalAiDependencyError(
            "Optional AI dependency 'chromadb' is required for Chroma-backed hydration. Install mergetonic[ai] before using non-memory hydration runtimes."
        ) from exc
    return chromadb


def parse_hydration_chroma_url(raw_url: str) -> HydrationChromaUrl:
    parsed = urlparse(raw_url)
    if parsed.scheme not in {"http", "https"}:
        raise HydrationRuntimeError(f"TONIC_CHROMA_URL must use http or https. Received: {raw_url}")
    if not parsed.hostname:
        raise HydrationRuntimeError(f"Invalid TONIC_CHROMA_URL: {raw_url}")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    return HydrationChromaUrl(
        raw=raw_url,
        origin=f"{parsed.scheme}://{parsed.hostname}:{port}",
        host=parsed.hostname,
        port=port,
        ssl=parsed.scheme == "https",
        pathname=parsed.path or "/",
    )


def probe_hydration_chroma_heartbeat(
    config: HydrationRuntimeConfig,
    *,
    timeout_seconds: float = 3.0,
) -> HydrationChromaHeartbeat:
    parsed = parse_hydration_chroma_url(config.url)
    heartbeat_url = urljoin(f"{parsed.origin}/", config.heartbeat_path.lstrip("/"))
    try:
        with urllib.request.urlopen(heartbeat_url, timeout=timeout_seconds) as response:
            status = getattr(response, "status", None) or response.getcode()
            return HydrationChromaHeartbeat(
                ok=200 <= int(status) < 300,
                heartbeat_url=heartbeat_url,
                status=int(status),
                error="" if 200 <= int(status) < 300 else f"HTTP {status}",
            )
    except urllib.error.HTTPError as exc:
        return HydrationChromaHeartbeat(
            ok=False,
            heartbeat_url=heartbeat_url,
            status=exc.code,
            error=f"HTTP {exc.code}",
        )
    except Exception as exc:
        return HydrationChromaHeartbeat(
            ok=False,
            heartbeat_url=heartbeat_url,
            error=str(exc),
        )


def create_hydration_chroma_client(config: HydrationRuntimeConfig):
    chromadb = load_hydration_chromadb()
    if config.mode == "http":
        parsed = parse_hydration_chroma_url(config.url)
        return chromadb.HttpClient(host=parsed.host, port=parsed.port, ssl=parsed.ssl)
    if config.mode == "persistent":
        return chromadb.PersistentClient(path=str(config.persist_path))
    if config.mode == "ephemeral":
        return chromadb.EphemeralClient()
    raise HydrationRuntimeError(
        f"Unsupported Chroma runtime mode for Python hydration: {config.mode}"
    )


def get_hydration_chroma_collection(config: HydrationRuntimeConfig):
    client = create_hydration_chroma_client(config)
    return client.get_or_create_collection(
        name=config.collection_name,
        metadata={
            "tonic.collection": config.collection_name,
            "tonic.persist_path": str(config.persist_path),
        },
    )
