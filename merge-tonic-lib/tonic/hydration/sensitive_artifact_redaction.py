"""Redact secret-like keys from artifacts before persisting JSON to disk."""

from __future__ import annotations

from typing import Any

_SENSITIVE_KEYS = frozenset(
    {
        "api_key",
        "apikey",
        "token",
        "access_token",
        "secret",
        "client_secret",
        "password",
        "authorization",
        "auth",
    }
)


def _key_looks_sensitive(key: str) -> bool:
    return str(key).lower().replace("-", "_") in _SENSITIVE_KEYS


def redact_sensitive_values(obj: Any) -> Any:
    """Recursively redact values under keys that look like secret holders."""
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            if _key_looks_sensitive(str(k)):
                out[k] = "***REDACTED***"
            else:
                out[k] = redact_sensitive_values(v)
        return out
    if isinstance(obj, list):
        return [redact_sensitive_values(v) for v in obj]
    if isinstance(obj, tuple):
        return tuple(redact_sensitive_values(v) for v in obj)
    return obj
