"""Pytest configuration: CLI tests assume the GPL acceptance gate is satisfied."""

from __future__ import annotations

import os

import pytest


@pytest.fixture(autouse=True)
def _mergetonic_license_accepted_for_tests() -> None:
    os.environ["MERGETONIC_LICENSE_ACCEPTED"] = "1"
    yield
