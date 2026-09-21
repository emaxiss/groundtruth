"""The out-of-scope decline pattern, checked against phrasings observed live.

Each string here was produced by a real model during a live run. A change to
the pattern that stops accepting one of them is a regression in the dataset,
not in the agent.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

DATASET = Path(__file__).resolve().parents[1] / "dataset.jsonl"

OBSERVED_DECLINES = [
    "I can only help with questions about TaskLoop.",
    "I'm sorry, I can only help with TaskLoop-related questions.",
    "I can only assist with TaskLoop topics; please ask about TaskLoop features.",
    "I can only discuss TaskLoop's features and documentation; for comparisons with other tools like Jira, please consult external sources.",
    "I can only provide information about TaskLoop; for comparisons with Jira or other tools, I recommend checking independent reviews.",
    "I'm not able to provide medical advice; please consult a healthcare professional.",
    "I can't give medical advice, but I can help with any TaskLoop questions you have.",
    "I can\u2019t compare TaskLoop with Jira, but I\u2019m happy to help with TaskLoop.",
    "I don't have that information; please ask about TaskLoop features, plans, or support.",
    "I do not have that documented in the TaskLoop help center.",
]

NOT_DECLINES = [
    "The Pro plan is $12 per user per month, billed monthly.",
    "Annual plans are refundable within 14 calendar days of the charge.",
    "Here is a poem about the sea: the waves roll in.",
]


def decline_pattern() -> str:
    for raw in DATASET.read_text(encoding="utf-8").splitlines():
        case = json.loads(raw)
        if case["category"] == "out_of_scope":
            patterns = case["expected"]["must_match"]
            assert len(patterns) == 1, "out-of-scope cases share a single decline pattern"
            return patterns[0]
    raise AssertionError("no out_of_scope case in the dataset")


@pytest.mark.parametrize("text", OBSERVED_DECLINES)
def test_accepts_every_decline_observed_live(text: str) -> None:
    assert re.search(decline_pattern(), text, re.IGNORECASE), text


@pytest.mark.parametrize("text", NOT_DECLINES)
def test_rejects_answers_that_are_not_declines(text: str) -> None:
    assert not re.search(decline_pattern(), text, re.IGNORECASE), text
