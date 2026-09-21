"""HTTP against the running app, with throttles and outages reported as outcomes."""

from __future__ import annotations

import os
import time
from typing import Any

import httpx

from harness.dataset import Case


class RateLimited(Exception):
    """The provider throttled the request. Distinct from a wrong answer:
    a throttled case scored as a failure would misreport the agent."""


class ProviderUnavailable(Exception):
    """Every model in the routing list failed upstream or timed out. The app
    reports this as a 5xx; the harness records it as its own outcome for the
    same reason as a rate limit."""


UNAVAILABLE_STATUSES = (502, 503, 504)


# Free-tier providers cap requests per minute. A delay between cases keeps a
# run under the cap; a 429 that still gets through waits and retries before it
# is reported as a rate-limited outcome.
DELAY_S = float(os.environ.get("GROUNDTRUTH_EVAL_DELAY_MS", "0")) / 1000
RETRY_BACKOFF_S = (5.0, 15.0, 30.0)


def post_json(client: httpx.Client, endpoint: str, payload: dict[str, Any], case_id: str) -> httpx.Response:
    """POST one case, retrying throttles and provider outages before reporting them as outcomes."""
    for attempt, backoff in enumerate((*RETRY_BACKOFF_S, None)):
        if DELAY_S:
            time.sleep(DELAY_S)
        try:
            res = client.post(f"/api/{endpoint}", json=payload)
        except httpx.TimeoutException as e:
            # The app gave up waiting on the provider; that is not a wrong answer.
            if backoff is None:
                raise ProviderUnavailable(f"{case_id}: no response after {attempt} retries ({e!r})") from e
            time.sleep(backoff)
            continue
        if res.status_code == 429:
            # A daily cap does not clear in seconds; report it instead of waiting.
            if backoff is None or "per-day" in res.text or "daily" in res.text:
                raise RateLimited(f"{case_id}: provider rate limited after {attempt} retries ({res.text[:200]})")
            retry_after = res.headers.get("retry-after")
            time.sleep(float(retry_after) if retry_after and retry_after.isdigit() else backoff)
        elif res.status_code in UNAVAILABLE_STATUSES:
            if backoff is None:
                raise ProviderUnavailable(f"{case_id}: provider unavailable after {attempt} retries ({res.text[:200]})")
            time.sleep(backoff)
        else:
            return res
    raise AssertionError("unreachable")


def post(client: httpx.Client, case: Case) -> httpx.Response:
    return post_json(client, case.endpoint, case.input, case.id)
