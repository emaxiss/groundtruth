"""Judge agreement: does the correctness metric separate answers whose quality is known?

Each row in judge_agreement.jsonl is an answer written to a label: `faithful`
and `missing_secondary` should pass the threshold, `wrong_figure` and
`contradiction` should not. The label is true by construction, so this
measures the judge and nothing else; no app is involved. The suite's pass
rate is the agreement rate, and a judge swap is not done until this is re-run.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from deepeval.test_case import LLMTestCase

from harness.dataset import EVALS_DIR
from harness.judge import CORRECTNESS_THRESHOLD, JudgeConfig, OpenRouterJudge, correctness_metric

pytestmark = [pytest.mark.judge, pytest.mark.agreement]

ROWS: list[dict[str, Any]] = [
    json.loads(line)
    for line in (EVALS_DIR / "judge_agreement.jsonl").read_text(encoding="utf-8").splitlines()
    if line.strip()
]


@pytest.fixture(scope="module")
def judge() -> OpenRouterJudge:
    return OpenRouterJudge(JudgeConfig.from_env())


@pytest.mark.parametrize("row", ROWS, ids=[r["id"] for r in ROWS])
def test_judge_agrees_with_the_label(judge: OpenRouterJudge, row: dict[str, Any], record_property: Any) -> None:
    metric = correctness_metric(judge)
    metric.measure(
        LLMTestCase(input=row["input"], actual_output=row["actual_output"], expected_output=row["expected_output"])
    )
    record_property("score", metric.score)
    passed = metric.score is not None and metric.score >= CORRECTNESS_THRESHOLD
    assert passed == row["expect_pass"], (
        f"{row['label']}: judge scored {metric.score} against threshold {CORRECTNESS_THRESHOLD} ({metric.reason})"
    )
