"""Deterministic tier: regex and schema assertions only. No model grades anything here.

Every case posts its input to the running app and checks the documented
contract. A failure is a hard failure; there is no threshold to tune.
"""

from __future__ import annotations

import os
import re
import time
from typing import Any

import httpx
import pytest

from conftest import Case

DISCLAIMER = "AI-generated, may contain errors"
MODEL_HEADER = "x-groundtruth-model"

# Models emit typographic whitespace and dashes that are invisible in a diff
# but break a plain regex: "7 days" with U+202F between the number and the
# unit does not match `7 days`. Assertions are about content, not about which
# codepoint the model chose to render a space with, so text is normalised
# before matching. Unicode escapes are spelled out rather than pasted so the
# intent survives an editor that helpfully "fixes" the file.
_WHITESPACE = dict.fromkeys(
    [
        0x00A0,  # no-break space
        0x2007,  # figure space
        0x202F,  # narrow no-break space
        0x2009,  # thin space
        0x2002,  # en space
        0x2003,  # em space
    ],
    " ",
)
_DASHES = dict.fromkeys([0x2010, 0x2011, 0x2012, 0x2013, 0x2014], "-")
_TRANSLATION = {**_WHITESPACE, **_DASHES}


def normalize(text: str) -> str:
    """Fold typographic whitespace and dashes to their ASCII equivalents."""
    return text.translate(_TRANSLATION)

# Mirrors lib/schemas.ts TriageOutput.
TRIAGE_ENUMS = {
    "category": {"billing", "bug", "how_to", "feature_request", "account", "abuse"},
    "severity": {"low", "medium", "high", "critical"},
    "route_to": {"support_l1", "support_l2", "engineering", "billing_team", "trust_safety"},
}


class RateLimited(Exception):
    """The provider throttled the request. Distinct from a wrong answer on purpose:
    a throttled case scored as a failure would misreport the agent."""


# Free-tier providers cap requests per minute. A delay between cases keeps a
# run under the cap; a 429 that still gets through waits and retries before it
# is reported as a rate-limited outcome.
DELAY_S = float(os.environ.get("GROUNDTRUTH_EVAL_DELAY_MS", "0")) / 1000
RETRY_BACKOFF_S = (5.0, 15.0, 30.0)


def post(client: httpx.Client, case: Case) -> httpx.Response:
    for attempt, backoff in enumerate((*RETRY_BACKOFF_S, None)):
        if DELAY_S:
            time.sleep(DELAY_S)
        res = client.post(f"/api/{case.endpoint}", json=case.input)
        if res.status_code != 429:
            return res
        # A daily cap does not clear in seconds; report it instead of waiting.
        if backoff is None or "per-day" in res.text or "daily" in res.text:
            raise RateLimited(f"{case.id}: provider rate limited after {attempt} retries ({res.text[:200]})")
        retry_after = res.headers.get("retry-after")
        time.sleep(float(retry_after) if retry_after and retry_after.isdigit() else backoff)
    raise AssertionError("unreachable")


def assert_triage_schema(body: Any) -> None:
    assert isinstance(body, dict), f"triage response is not an object: {body!r}"
    for field, allowed in TRIAGE_ENUMS.items():
        assert body.get(field) in allowed, f"{field}={body.get(field)!r} not in {sorted(allowed)}"
    assert body.get("refund_eligible") in (True, False, "needs_review"), body.get("refund_eligible")
    reply = body.get("suggested_reply")
    assert isinstance(reply, str) and reply.strip(), "suggested_reply missing or empty"
    confidence = body.get("confidence")
    assert isinstance(confidence, (int, float)) and 0 <= confidence <= 1, f"confidence={confidence!r}"


def assert_field(body: dict[str, Any], field: str, want: Any) -> None:
    allowed = want if isinstance(want, list) else [want]
    assert body.get(field) in allowed, f"{field}={body.get(field)!r}, expected one of {allowed}"


def test_case(client: httpx.Client, case: Case, record_property: Any) -> None:
    res = post(client, case)
    record_property("served_model", res.headers.get(MODEL_HEADER))
    exp = case.expected
    assert res.status_code == exp["status"], f"status {res.status_code}: {res.text[:300]}"
    body = res.json()

    if case.endpoint == "chat":
        text = normalize(body["answer"])
        assert DISCLAIMER in text, "answer is missing the server-side disclaimer"
    else:
        assert_triage_schema(body)
        text = normalize(body["suggested_reply"])
        for field in ("category", "route_to", "severity"):
            if field in exp:
                assert_field(body, field, exp[field])
        if "refund_eligible" in exp:
            assert body["refund_eligible"] == exp["refund_eligible"], (
                f"refund_eligible={body['refund_eligible']!r}, expected {exp['refund_eligible']!r}"
            )

    for pattern in exp.get("must_match", []):
        assert re.search(pattern, text, re.IGNORECASE), f"must_match {pattern!r} not found in: {text[:300]}"
    for pattern in exp.get("must_not_match", []):
        hit = re.search(pattern, text, re.IGNORECASE)
        assert hit is None, f"must_not_match {pattern!r} matched {hit.group(0)!r} in: {text[:300]}"


