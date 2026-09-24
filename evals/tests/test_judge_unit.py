"""The judge module against a mocked provider. No network, no key."""

from __future__ import annotations

import json
import re
from pathlib import Path

import httpx
import pytest
from pydantic import BaseModel

from harness.dataset import DATASET
from harness.judge import JudgeConfig, JudgeError, OpenRouterJudge, RateLimited, load_goldens

CFG = JudgeConfig(
    base_url="https://judge.test/v1", api_key="k", model="j/one:free", fallback_models=("j/two:free",), allow_paid=False
)


class Verdict(BaseModel):
    score: int
    reason: str


def judge_with(handler) -> OpenRouterJudge:
    return OpenRouterJudge(CFG, client=httpx.Client(base_url=CFG.base_url, transport=httpx.MockTransport(handler)))


def ok(content: str, model: str = "j/served:free") -> httpx.Response:
    return httpx.Response(200, json={"model": model, "choices": [{"message": {"content": content}}]})


def test_generate_with_a_schema_returns_a_validated_instance() -> None:
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(req.content)
        seen["auth"] = req.headers.get("authorization")
        return ok('{"score": 7, "reason": "missing the discount"}')

    j = judge_with(handler)
    out = j.generate("grade this", schema=Verdict)
    assert out == Verdict(score=7, reason="missing the discount")
    assert j.served_model == "j/served:free"
    assert seen["auth"] == "Bearer k"
    assert seen["body"]["models"] == ["j/one:free", "j/two:free"]
    assert seen["body"]["response_format"] == {"type": "json_object"}
    assert seen["body"]["temperature"] == 0


def test_generate_without_a_schema_returns_raw_text() -> None:
    assert judge_with(lambda r: ok("plain text")).generate("q") == "plain text"


def test_a_fenced_json_block_still_validates() -> None:
    out = judge_with(lambda r: ok('```json\n{"score": 3, "reason": "x"}\n```')).generate("q", schema=Verdict)
    assert out.score == 3


@pytest.mark.parametrize("content", ["not json", '{"score": "high"}', '{"reason": "no score"}', "[1, 2]"])
def test_json_that_does_not_fit_the_schema_is_a_judge_error(content: str) -> None:
    with pytest.raises(JudgeError, match="does not match Verdict"):
        judge_with(lambda r: ok(content)).generate("q", schema=Verdict)


def test_a_paid_judge_is_refused_before_any_call() -> None:
    with pytest.raises(JudgeError, match="paid judge model: openai/gpt-5"):
        JudgeConfig(
            base_url="u", api_key="k", model="openai/gpt-5", fallback_models=(), allow_paid=False
        ).assert_models_allowed()
    with pytest.raises(JudgeError, match="j/paid"):
        JudgeConfig(
            base_url="u", api_key="k", model="j/one:free", fallback_models=("j/paid",), allow_paid=False
        ).assert_models_allowed()
    JudgeConfig(
        base_url="u", api_key="k", model="openai/gpt-5", fallback_models=(), allow_paid=True
    ).assert_models_allowed()


def test_daily_cap_is_raised_immediately(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list = []
    monkeypatch.setattr("harness.judge.time.sleep", lambda s: calls.append(("sleep", s)))

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append("post")
        return httpx.Response(429, text="Rate limit exceeded: free-models-per-day")

    with pytest.raises(RateLimited, match="after 0 retries"):
        judge_with(handler).generate("q")
    assert calls == ["post"]


def test_a_transient_429_is_retried_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    sleeps: list = []
    monkeypatch.setattr("harness.judge.time.sleep", lambda s: sleeps.append(s))
    responses = iter([httpx.Response(429, text="slow down"), ok("ok")])
    assert judge_with(lambda r: next(responses)).generate("q") == "ok"
    assert sleeps == [5.0]


def test_a_200_with_no_choices_is_retried_then_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("harness.judge.time.sleep", lambda s: None)
    with pytest.raises(JudgeError, match="no choices: capacity"):
        judge_with(lambda r: httpx.Response(200, json={"error": {"message": "capacity"}})).generate("q")


def test_goldens_are_the_chat_cases_with_a_reference() -> None:
    goldens = load_goldens(DATASET)
    ids = [g.additional_metadata["id"] for g in goldens]
    assert len(goldens) == 9
    assert all(i.startswith(("factual-", "edge-")) for i in ids)
    assert all(g.expected_output for g in goldens)
    assert {g.additional_metadata["category"] for g in goldens} == {"factual", "edge"}


ROOT = Path(__file__).resolve().parents[2]


def routing(source: Path, prefix: str) -> set[str]:
    """Primary plus fallbacks for `prefix` (`GROUNDTRUTH` or `GROUNDTRUTH_JUDGE`) as a config file sets them."""
    text = source.read_text(encoding="utf-8")
    models: set[str] = set()
    for key in (f"{prefix}_MODEL", f"{prefix}_FALLBACK_MODELS"):
        match = re.search(rf"^\s*{key}\s*[=:]\s*(\S+)", text, re.MULTILINE)
        assert match, f"{key} is not set in {source.name}"
        models.update(m for m in match.group(1).split(",") if m)
    return models


@pytest.mark.parametrize("source", [".env.example", ".github/workflows/live-evals.yml"])
def test_the_judge_never_shares_a_model_with_the_agent(source: str) -> None:
    path = ROOT / source
    shared = routing(path, "GROUNDTRUTH") & routing(path, "GROUNDTRUTH_JUDGE")
    assert not shared, f"{source}: the judge could grade answers from {sorted(shared)}"
