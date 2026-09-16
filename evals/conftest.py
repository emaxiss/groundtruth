"""Shared fixtures: dataset loading and an HTTP client against the running app."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import pytest

DATASET = Path(__file__).with_name("dataset.jsonl")
DEFAULT_APP_URL = "http://localhost:3000"


@dataclass(frozen=True)
class Case:
    id: str
    category: str
    endpoint: str
    input: dict[str, Any]
    expected: dict[str, Any]
    reference: str | None
    why: str


def load_cases() -> list[Case]:
    cases = []
    for raw in DATASET.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        c = json.loads(raw)
        cases.append(
            Case(
                id=c["id"],
                category=c["category"],
                endpoint=c["endpoint"],
                input=c["input"],
                expected=c["expected"],
                reference=c.get("reference"),
                why=c["why"],
            )
        )
    return cases


CASES = load_cases()


@pytest.fixture(scope="session")
def app_url() -> str:
    return os.environ.get("GROUNDTRUTH_APP_URL", DEFAULT_APP_URL).rstrip("/")


@pytest.fixture(scope="session")
def client(app_url: str) -> httpx.Client:
    with httpx.Client(base_url=app_url, timeout=httpx.Timeout(60.0, connect=5.0)) as c:
        try:
            health = c.get("/api/health")
        except httpx.HTTPError as e:
            pytest.exit(f"app not reachable at {app_url} ({e}); set GROUNDTRUTH_APP_URL", returncode=2)
        if health.status_code != 200:
            pytest.exit(f"/api/health returned {health.status_code} at {app_url}", returncode=2)
        yield c


def pytest_generate_tests(metafunc: pytest.Metafunc) -> None:
    if "case" in metafunc.fixturenames:
        metafunc.parametrize("case", CASES, ids=[c.id for c in CASES])
