"""Shared fixtures: dataset loading and an HTTP client against the running app."""

from __future__ import annotations

import os

# DeepEval ships opt-out telemetry (PostHog). Off, unconditionally, before any
# deepeval import; the same variable is set in .env.example and in CI.
os.environ.setdefault("DEEPEVAL_TELEMETRY_OPT_OUT", "1")
# Free judge models are slow; DeepEval's default 180 s per-attempt budget cut
# off two of nine cases on a run where a passing case took 167 s. The judge's
# own retry budget (harness/judge.py) fits inside this figure.
os.environ.setdefault("DEEPEVAL_PER_ATTEMPT_TIMEOUT_SECONDS_OVERRIDE", "300")
from collections.abc import Iterator

import httpx
import pytest

from harness import config
from harness.dataset import CASES

pytest_plugins = ["harness.reporting"]


@pytest.fixture(scope="session")
def app_url() -> str:
    return config.app_url()


@pytest.fixture(scope="session")
def client(app_url: str, request: pytest.FixtureRequest) -> Iterator[httpx.Client]:
    with httpx.Client(base_url=app_url, timeout=httpx.Timeout(60.0, connect=5.0)) as c:
        try:
            health = c.get("/api/health")
        except httpx.HTTPError as e:
            pytest.exit(f"app not reachable at {app_url} ({e}); set GROUNDTRUTH_APP_URL", returncode=2)
        if health.status_code != 200:
            pytest.exit(f"/api/health returned {health.status_code} at {app_url}", returncode=2)
        body = health.json()
        # Refuse before the first case rather than after one that was billed.
        if not body.get("all_models_free") and not body.get("paid_models_allowed"):
            pytest.exit(
                f"app at {app_url} is configured with a paid model ({body.get('model')}); "
                "point GROUNDTRUTH_MODEL at a ':free' model or set GROUNDTRUTH_ALLOW_PAID_MODELS=1",
                returncode=2,
            )
        request.config.stash[config.HEALTH_KEY] = body
        yield c


def pytest_generate_tests(metafunc: pytest.Metafunc) -> None:
    if "case" in metafunc.fixturenames:
        n = config.repeats()
        runs = [(c, i) for c in CASES for i in range(1, n + 1)]
        ids = [c.id if n == 1 else f"{c.id}#{i}" for c, i in runs]
        metafunc.parametrize("case", [c for c, _ in runs], ids=ids)
