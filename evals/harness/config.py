"""Run-level settings shared by the fixtures and the reporting plugin."""

from __future__ import annotations

import os
from typing import Any

import pytest

DEFAULT_APP_URL = "http://localhost:3000"

# The app's /api/health payload, captured once per session by the client fixture.
HEALTH_KEY = pytest.StashKey[dict[str, Any]]()


def repeats() -> int:
    """How many times each case runs. Above 1, the report lists cases that did not hold every time."""
    return max(1, int(os.environ.get("GROUNDTRUTH_EVAL_REPEATS", "1")))


def app_url() -> str:
    return os.environ.get("GROUNDTRUTH_APP_URL", DEFAULT_APP_URL).rstrip("/")
