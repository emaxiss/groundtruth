"""Judge tier: answer quality scored by an LLM against each case's reference.

Noisier than the deterministic tier by construction, which is why it sits
behind the `judge` marker and is not a CI gate. Thresholds are calibrated
against the judge in use; see evals/README.md for how and DECISIONS.md for why.
"""

from __future__ import annotations

import os
import time
from typing import Any

import httpx
import pytest

from conftest import CASES, Case
from judge import JudgeConfig, judge
from test_deterministic import DELAY_S, DISCLAIMER, RateLimited, normalize

pytestmark = pytest.mark.judge

# Calibrated against nex-agi/nex-n2.5-pro:free over three runs (see evals/README.md).
# The rubric anchors correctness at 1.0 / 0.7 / 0.3 / 0.0; 0.5 sits between
# "a secondary fact is missing" (passes) and "a figure is wrong or the verdict
# is hedged" (fails). Relevancy scored 1.0 on every case in every run.
RELEVANCY_MIN = float(os.environ.get("GROUNDTRUTH_JUDGE_RELEVANCY_MIN", "0.7"))
CORRECTNESS_MIN = float(os.environ.get("GROUNDTRUTH_JUDGE_CORRECTNESS_MIN", "0.5"))

JUDGED = [c for c in CASES if c.endpoint == "chat" and c.reference]


@pytest.fixture(scope="session")
def judge_config() -> JudgeConfig:
    return JudgeConfig.from_env()


def strip_disclaimer(answer: str) -> str:
    head, sep, _ = answer.rpartition("\n\n")
    return head if sep and DISCLAIMER in answer else answer


@pytest.mark.parametrize("judged", JUDGED, ids=[c.id for c in JUDGED])
def test_judged(client: httpx.Client, judge_config: JudgeConfig, judged: Case, record_property: Any) -> None:
    case = judged
    if DELAY_S:
        time.sleep(DELAY_S)
    res = client.post("/api/chat", json=case.input)
    if res.status_code == 429:
        raise RateLimited(f"{case.id}: provider rate limited ({res.text[:200]})")
    assert res.status_code == 200, f"status {res.status_code}: {res.text[:300]}"
    record_property("served_model", res.headers.get("x-groundtruth-model"))

    answer = normalize(strip_disclaimer(res.json()["answer"]))
    scores = judge(case.input["message"], answer, case.reference or "", judge_config)
    record_property("scores", scores.as_dict())
    record_property("score", scores.correctness)
    record_property("rationale", scores.rationale)

    assert scores.relevancy >= RELEVANCY_MIN, f"relevancy {scores.relevancy} < {RELEVANCY_MIN}: {scores.rationale}"
    assert scores.correctness >= CORRECTNESS_MIN, (
        f"correctness {scores.correctness} < {CORRECTNESS_MIN}: {scores.rationale}\nanswer: {answer[:300]}"
    )
