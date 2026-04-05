"""Optional Hugging Face Hub adapters (import `huggingface_hub` only behind guards)."""

HF_AVAILABLE = False
try:
    import huggingface_hub  # noqa: F401

    HF_AVAILABLE = True
except ImportError:
    pass

__all__ = ["HF_AVAILABLE", "WeaveHubMissingError", "require_hf"]


class WeaveHubMissingError(RuntimeError):
    pass


def require_hf() -> None:
    if not HF_AVAILABLE:
        raise WeaveHubMissingError(
            "huggingface_hub is not installed; pip install mergetonic-hf-weave or mergetonic[hf-weave]"
        )
