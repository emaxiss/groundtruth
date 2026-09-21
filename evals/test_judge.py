"""Judge tier: answer quality scored by DeepEval metrics against each case's reference.

Noisier than the deterministic tier by construction, which is why it sits
behind the `judge` marker and is not a CI gate. Thresholds are calibrated
against the judge in use; see evals/README.md for how and DECISIONS.md for why.
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from deepeval import assert_test
from deepeval.dataset import EvaluationDataset, Golden
from deepeval.test_case import LLMTestCase

from conftest import DATASET
from judge import JudgeConfig, OpenRouterJudge, correctness_metric, load_goldens, relevancy_metric
from test_deterministic import DISCLAIMER, normalize, post_json

pytestmark = pytest.mark.judge

dataset = EvaluationDataset(goldens=load_goldens(DATASET))


@pytest.fixture(scope="session")
def judge() -> OpenRouterJudge:
    return OpenRouterJudge(JudgeConfig.from_env())


def strip_disclaimer(answer: str) -> str:
    head, sep, _ = answer.rpartition("\n\n")
    return head if sep and DISCLAIMER in answer else answer


@pytest.mark.parametrize("golden", dataset.goldens, ids=[g.additional_metadata["id"] for g in dataset.goldens])
def test_judged(client: httpx.Client, judge: OpenRouterJudge, golden: Golden, record_property: Any) -> None:
    res = post_json(client, "chat", {"message": golden.input}, golden.additional_metadata["id"])
    assert res.status_code == 200, f"status {res.status_code}: {res.text[:300]}"
    record_property("served_model", res.headers.get("x-groundtruth-model"))

    test_case = LLMTestCase(
        input=golden.input,
        actual_output=normalize(strip_disclaimer(res.json()["answer"])),
        expected_output=golden.expected_output,
        name=golden.additional_metadata["id"],
    )
    relevancy, correctness = relevancy_metric(judge), correctness_metric(judge)
    try:
        assert_test(test_case=test_case, metrics=[relevancy, correctness], run_async=False)
    finally:
        # Scores are recorded whether or not the assertion held, so the run
        # report and the calibration script see every case.
        record_property(
            "scores",
            {
                "relevancy": relevancy.score,
                "correctness": correctness.score,
                "judge_model": judge.served_model or judge.get_model_name(),
            },
        )
        record_property("score", correctness.score)
        record_property("rationale", correctness.reason)
