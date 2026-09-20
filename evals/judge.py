"""LLM judge for answer quality: relevancy and correctness against a reference.

Two scores in [0, 1] from one JSON-mode call. The judge talks to the provider
directly (not through the app), uses its own model, and is subject to the
same free-model guard as the app: a paid judge is refused unless opted into.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
RETRY_BACKOFF_S = (5.0, 15.0)


class JudgeError(Exception):
    """The judge could not produce a score. Distinct from a low score."""


class RateLimited(Exception):
    """The judge's provider throttled the request."""


@dataclass(frozen=True)
class JudgeConfig:
    base_url: str
    api_key: str
    model: str
    fallback_models: tuple[str, ...]
    allow_paid: bool

    @classmethod
    def from_env(cls) -> "JudgeConfig":
        model = os.environ.get("GROUNDTRUTH_JUDGE_MODEL", "").strip()
        api_key = os.environ.get("GROUNDTRUTH_API_KEY", "").strip()
        if not model:
            raise JudgeError("GROUNDTRUTH_JUDGE_MODEL is not set")
        if not api_key:
            raise JudgeError("GROUNDTRUTH_API_KEY is not set")
        fallbacks = tuple(
            m.strip() for m in os.environ.get("GROUNDTRUTH_JUDGE_FALLBACK_MODELS", "").split(",") if m.strip()
        )
        cfg = cls(
            base_url=os.environ.get("GROUNDTRUTH_BASE_URL", DEFAULT_BASE_URL).rstrip("/"),
            api_key=api_key,
            model=model,
            fallback_models=fallbacks,
            allow_paid=os.environ.get("GROUNDTRUTH_ALLOW_PAID_MODELS") == "1",
        )
        cfg.assert_models_allowed()
        return cfg

    def assert_models_allowed(self) -> None:
        if self.allow_paid:
            return
        paid = [m for m in (self.model, *self.fallback_models) if not m.endswith(":free")]
        if paid:
            raise JudgeError(
                f"Refusing to use a paid judge model: {', '.join(paid)}. "
                'Every model id must end in ":free", or set GROUNDTRUTH_ALLOW_PAID_MODELS=1 to opt in.'
            )


@dataclass(frozen=True)
class JudgeScores:
    relevancy: float
    correctness: float
    rationale: str
    model: str

    def as_dict(self) -> dict[str, Any]:
        return {"relevancy": self.relevancy, "correctness": self.correctness, "judge_model": self.model}


SYSTEM_PROMPT = """You grade a customer-support answer against a reference answer written by the documentation owner. Output JSON only.

Score two things independently, each a number from 0 to 1:

relevancy: does the answer address the question that was asked?
  1.0 = answers exactly what was asked, nothing off-topic
  0.5 = partly addresses it, or buries it in unrelated material
  0.0 = does not address the question

correctness: does the answer agree with the reference on every fact the reference states?
  1.0 = every fact in the reference is present and matches (numbers, windows, yes/no verdicts); extra correct detail is fine
  0.7 = the verdict and main figure match but a secondary fact from the reference is missing
  0.3 = the verdict matches but a stated figure is wrong, or the verdict is hedged when the reference is definite
  0.0 = the verdict contradicts the reference, or a central figure is wrong

Judge only against the reference. Do not reward confident prose. Ignore the answer's trailing AI disclaimer if present.

Respond with exactly: {"relevancy": <number>, "correctness": <number>, "rationale": "<one sentence>"}"""


def _user_prompt(question: str, answer: str, reference: str) -> str:
    return f"Question:\n{question}\n\nReference answer:\n{reference}\n\nAnswer to grade:\n{answer}"


def _clamp(value: Any, field: str) -> float:
    try:
        f = float(value)
    except (TypeError, ValueError) as e:
        raise JudgeError(f"judge returned a non-numeric {field}: {value!r}") from e
    if not 0.0 <= f <= 1.0:
        raise JudgeError(f"judge returned {field} outside [0, 1]: {f}")
    return f


def parse_scores(content: str, model: str) -> JudgeScores:
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[4:].strip() if text.lower().startswith("json") else text.strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise JudgeError(f"judge did not return JSON: {content[:200]!r}") from e
    if not isinstance(data, dict):
        raise JudgeError(f"judge returned a non-object: {content[:200]!r}")
    return JudgeScores(
        relevancy=_clamp(data.get("relevancy"), "relevancy"),
        correctness=_clamp(data.get("correctness"), "correctness"),
        rationale=str(data.get("rationale", "")).strip()[:500],
        model=model,
    )


def judge(
    question: str,
    answer: str,
    reference: str,
    config: JudgeConfig,
    client: httpx.Client | None = None,
) -> JudgeScores:
    """Score one answer. Retries transient provider failures, then raises."""
    body: dict[str, Any] = {
        "model": config.model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _user_prompt(question, answer, reference)},
        ],
    }
    if config.fallback_models:
        body["models"] = [config.model, *config.fallback_models]

    own_client = client is None
    c = client or httpx.Client(base_url=config.base_url, timeout=httpx.Timeout(90.0, connect=5.0))
    try:
        for attempt, backoff in enumerate((*RETRY_BACKOFF_S, None)):
            res = c.post(
                "/chat/completions",
                json=body,
                headers={"authorization": f"Bearer {config.api_key}", "content-type": "application/json"},
            )
            if res.status_code == 429:
                text = res.text
                if backoff is None or "per-day" in text or "daily" in text:
                    raise RateLimited(f"judge rate limited after {attempt} retries: {text[:200]}")
                time.sleep(backoff)
                continue
            if res.status_code >= 500 and backoff is not None:
                time.sleep(backoff)
                continue
            if res.status_code != 200:
                raise JudgeError(f"judge provider returned {res.status_code}: {res.text[:200]}")
            payload = res.json()
            choices = payload.get("choices")
            if not isinstance(choices, list) or not choices:
                detail = (payload.get("error") or {}).get("message")
                if backoff is not None:
                    time.sleep(backoff)
                    continue
                raise JudgeError(f"judge returned no choices{': ' + detail if detail else ''}")
            content = (choices[0].get("message") or {}).get("content") or ""
            return parse_scores(content, payload.get("model") or config.model)
        raise JudgeError("judge exhausted retries")
    finally:
        if own_client:
            c.close()
