"""post_json turns throttles and provider outages into outcomes instead of failed cases."""

from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest

from harness import http
from harness.http import ProviderUnavailable, RateLimited, post_json


def client_answering(*responses: httpx.Response) -> tuple[httpx.Client, list[httpx.Request]]:
    queue, seen = list(responses), []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return queue.pop(0) if len(queue) > 1 else queue[0]

    return httpx.Client(base_url="http://app.test", transport=httpx.MockTransport(handler)), seen


@pytest.fixture
def sleeps(monkeypatch: pytest.MonkeyPatch) -> list[float]:
    recorded: list[float] = []
    record: Callable[[float], None] = recorded.append
    monkeypatch.setattr("harness.http.time.sleep", record)
    monkeypatch.setattr(http, "DELAY_S", 0.0)
    return recorded


def test_a_200_is_returned_without_waiting(sleeps: list[float]) -> None:
    client, seen = client_answering(httpx.Response(200, json={"answer": "ok"}))

    res = post_json(client, "chat", {"message": "hi"}, "factual-001")

    assert res.status_code == 200
    assert seen[0].url.path == "/api/chat"
    assert sleeps == []


def test_a_400_is_the_cases_problem_and_is_returned(sleeps: list[float]) -> None:
    client, seen = client_answering(httpx.Response(400, json={"kind": "validation"}))

    assert post_json(client, "chat", {"message": ""}, "edge-005").status_code == 400
    assert len(seen) == 1


def test_a_transient_429_is_retried_with_backoff(sleeps: list[float]) -> None:
    client, seen = client_answering(httpx.Response(429, text="slow down"), httpx.Response(200, json={}))

    assert post_json(client, "chat", {}, "factual-001").status_code == 200
    assert len(seen) == 2
    assert sleeps == [5.0]


def test_retry_after_overrides_the_backoff(sleeps: list[float]) -> None:
    client, _ = client_answering(
        httpx.Response(429, headers={"retry-after": "2"}, text="slow down"), httpx.Response(200, json={})
    )

    post_json(client, "chat", {}, "factual-001")

    assert sleeps == [2.0]


def test_a_daily_cap_is_reported_at_once(sleeps: list[float]) -> None:
    client, seen = client_answering(httpx.Response(429, text="free-models-per-day limit reached"))

    with pytest.raises(RateLimited, match="factual-001"):
        post_json(client, "chat", {}, "factual-001")
    assert len(seen) == 1
    assert sleeps == []


def test_a_persistent_429_is_rate_limited_after_the_retry_budget(sleeps: list[float]) -> None:
    client, seen = client_answering(httpx.Response(429, text="slow down"))

    with pytest.raises(RateLimited, match="after 3 retries"):
        post_json(client, "chat", {}, "factual-001")
    assert len(seen) == 4
    assert sleeps == [5.0, 15.0, 30.0]


@pytest.mark.parametrize("status", [502, 503, 504])
def test_an_exhausted_provider_is_unavailable_not_failed(status: int, sleeps: list[float]) -> None:
    client, seen = client_answering(httpx.Response(status, json={"kind": "upstream"}))

    with pytest.raises(ProviderUnavailable, match="after 3 retries"):
        post_json(client, "triage", {}, "triage-001")
    assert len(seen) == 4


def test_a_provider_that_recovers_is_not_reported(sleeps: list[float]) -> None:
    client, _ = client_answering(httpx.Response(502, json={}), httpx.Response(200, json={}))

    assert post_json(client, "chat", {}, "factual-001").status_code == 200
    assert sleeps == [5.0]


def test_the_pacing_delay_runs_before_every_attempt(monkeypatch: pytest.MonkeyPatch) -> None:
    recorded: list[float] = []
    monkeypatch.setattr("harness.http.time.sleep", recorded.append)
    monkeypatch.setattr(http, "DELAY_S", 3.5)
    client, _ = client_answering(httpx.Response(200, json={}))

    post_json(client, "chat", {}, "factual-001")

    assert recorded == [3.5]
