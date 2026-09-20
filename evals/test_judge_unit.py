"""The judge module against a mocked provider. No network, no key."""

from __future__ import annotations

import json

import httpx
import pytest

from judge import JudgeConfig, JudgeError, JudgeScores, RateLimited, judge, parse_scores

CFG = JudgeConfig(
    base_url="https://judge.test/v1",
    api_key="k",
    model="j/one:free",
    fallback_models=("j/two:free",),
    allow_paid=False,
)


def provider(handler):
    return httpx.Client(base_url=CFG.base_url, transport=httpx.MockTransport(handler))


def ok(content: str, model: str = "j/served:free") -> httpx.Response:
    return httpx.Response(200, json={"model": model, "choices": [{"message": {"content": content}}]})


def test_scores_come_back_typed_with_the_serving_model() -> None:
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(req.content)
        seen["auth"] = req.headers.get("authorization")
        return ok('{"relevancy": 1, "correctness": 0.7, "rationale": "missing the discount"}')

    s = judge("q", "a", "ref", CFG, client=provider(handler))
    assert s == JudgeScores(relevancy=1.0, correctness=0.7, rationale="missing the discount", model="j/served:free")
    assert seen["auth"] == "Bearer k"
    assert seen["body"]["models"] == ["j/one:free", "j/two:free"]
    assert seen["body"]["response_format"] == {"type": "json_object"}
    assert seen["body"]["temperature"] == 0


def test_a_fenced_json_block_is_still_parsed() -> None:
    s = parse_scores('```json\n{"relevancy": 0.5, "correctness": 0.3, "rationale": "x"}\n```', "m")
    assert (s.relevancy, s.correctness) == (0.5, 0.3)


@pytest.mark.parametrize(
    "content",
    [
        "not json at all",
        '{"relevancy": "high", "correctness": 1}',
        '{"relevancy": 1.5, "correctness": 1}',
        '{"correctness": 1}',
        "[1, 2]",
    ],
)
def test_malformed_scores_are_judge_errors_not_low_scores(content: str) -> None:
    with pytest.raises(JudgeError):
        parse_scores(content, "m")


def test_a_paid_judge_is_refused_before_any_call() -> None:
    with pytest.raises(JudgeError, match="paid judge model: openai/gpt-5"):
        JudgeConfig(base_url="u", api_key="k", model="openai/gpt-5", fallback_models=(), allow_paid=False).assert_models_allowed()
    with pytest.raises(JudgeError, match="j/paid"):
        JudgeConfig(base_url="u", api_key="k", model="j/one:free", fallback_models=("j/paid",), allow_paid=False).assert_models_allowed()
    JudgeConfig(base_url="u", api_key="k", model="openai/gpt-5", fallback_models=(), allow_paid=True).assert_models_allowed()


def test_daily_cap_is_raised_immediately(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []
    monkeypatch.setattr("judge.time.sleep", lambda s: calls.append(("sleep", s)))

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append("post")
        return httpx.Response(429, text="Rate limit exceeded: free-models-per-day")

    with pytest.raises(RateLimited, match="after 0 retries"):
        judge("q", "a", "ref", CFG, client=provider(handler))
    assert calls == ["post"]


def test_a_transient_429_is_retried_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    sleeps = []
    monkeypatch.setattr("judge.time.sleep", lambda s: sleeps.append(s))
    responses = iter([httpx.Response(429, text="slow down"), ok('{"relevancy": 1, "correctness": 1, "rationale": ""}')])

    s = judge("q", "a", "ref", CFG, client=provider(lambda req: next(responses)))
    assert s.correctness == 1.0
    assert sleeps == [5.0]


def test_a_200_with_no_choices_is_retried_then_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("judge.time.sleep", lambda s: None)

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": {"message": "capacity"}})

    with pytest.raises(JudgeError, match="no choices: capacity"):
        judge("q", "a", "ref", CFG, client=provider(handler))
