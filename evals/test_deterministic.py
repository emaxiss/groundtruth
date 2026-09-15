"""Deterministic tier: regex and schema assertions only. No model grades anything here.

Every case posts its input to the running app and checks the documented
contract. A failure is a hard failure; there is no threshold to tune.
"""

from __future__ import annotations

import re
from typing import Any

import httpx
import pytest

from conftest import Case

DISCLAIMER = "AI-generated, may contain errors"

# Mirrors lib/schemas.ts TriageOutput.
TRIAGE_ENUMS = {
    "category": {"billing", "bug", "how_to", "feature_request", "account", "abuse"},
    "severity": {"low", "medium", "high", "critical"},
    "route_to": {"support_l1", "support_l2", "engineering", "billing_team", "trust_safety"},
}


class RateLimited(Exception):
    """The provider throttled the request. Distinct from a wrong answer on purpose:
    a throttled case scored as a failure would misreport the agent."""


def post(client: httpx.Client, case: Case) -> httpx.Response:
    res = client.post(f"/api/{case.endpoint}", json=case.input)
    if res.status_code == 429:
        raise RateLimited(f"{case.id}: provider rate limited ({res.text[:200]})")
    return res


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


def test_case(client: httpx.Client, case: Case) -> None:
    res = post(client, case)
    exp = case.expected
    assert res.status_code == exp["status"], f"status {res.status_code}: {res.text[:300]}"
    body = res.json()

    if case.endpoint == "chat":
        text = body["answer"]
        assert DISCLAIMER in text, "answer is missing the server-side disclaimer"
    else:
        assert_triage_schema(body)
        text = body["suggested_reply"]
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


@pytest.mark.judge
def test_judge_tier_placeholder() -> None:
    pytest.skip("judge tier is not implemented yet")
