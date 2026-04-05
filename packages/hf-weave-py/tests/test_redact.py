from __future__ import annotations

import os

from mergetonic_hf_weave.client import redact_token


def test_redact_hf_token() -> None:
    os.environ["HF_TOKEN"] = "tok_x"
    assert redact_token("see tok_x here") == "see *** here"
