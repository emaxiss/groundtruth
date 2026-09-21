"""DeepEval judge tier: answer relevancy and correctness against a reference.

The judge model is an OpenRouter model behind `DeepEvalBaseLLM`, so every
DeepEval metric can drive it. It is a different model family from the agent
and is subject to the same free-model rule as the app: a paid judge is
refused unless explicitly opted into.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from deepeval.dataset import Golden
from deepeval.metrics import AnswerRelevancyMetric, GEval
from deepeval.metrics.g_eval.utils import Rubric
from deepeval.models import DeepEvalBaseLLM
from deepeval.test_case import SingleTurnParams
from pydantic import BaseModel

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
# One retry with a short backoff: DeepEval wraps each judge call in its own
# per-attempt budget (set in conftest.py), and this must fit inside it.
RETRY_BACKOFF_S = (5.0,)
HTTP_TIMEOUT_S = 90.0

# Calibrated against nex-agi/nex-n2.5-pro:free over three runs; see evals/README.md.
# Relevancy counts the share of statements that address the question. A support
# answer that adds correct neighbouring facts (the plan that does have the SLA,
# when asked about one that does not) scores lower without being worse, so
# the bar is a majority of statements, not all of them.
RELEVANCY_THRESHOLD = float(os.environ.get("GROUNDTRUTH_JUDGE_RELEVANCY_MIN", "0.5"))
CORRECTNESS_THRESHOLD = float(os.environ.get("GROUNDTRUTH_JUDGE_CORRECTNESS_MIN", "0.5"))


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
    def from_env(cls) -> JudgeConfig:
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


def _strip_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        t = t[4:] if t.lower().startswith("json") else t
    return t.strip()


class OpenRouterJudge(DeepEvalBaseLLM):
    """An OpenAI-compatible judge for DeepEval metrics, with JSON mode and a free-model guard.

    DeepEval's metrics hand `generate()` a Pydantic schema and expect an
    instance back; a judge that returns prose here fails every metric with a
    parse error, so JSON mode is always on and the schema is validated locally.
    """

    def __init__(self, config: JudgeConfig, client: httpx.Client | None = None):
        self.config = config
        self.client = client or httpx.Client(
            base_url=config.base_url, timeout=httpx.Timeout(HTTP_TIMEOUT_S, connect=5.0)
        )
        self.served_model: str | None = None
        super().__init__(config.model)

    def load_model(self) -> httpx.Client:
        return self.client

    def get_model_name(self) -> str:
        return self.config.model

    def generate(self, prompt: str, schema: type[BaseModel] | None = None) -> str | BaseModel:
        content = self._complete(prompt)
        if schema is None:
            return content
        try:
            return schema.model_validate_json(_strip_fence(content))
        except ValueError as e:
            raise JudgeError(f"judge returned JSON that does not match {schema.__name__}: {content[:200]!r}") from e

    async def a_generate(self, prompt: str, schema: type[BaseModel] | None = None) -> str | BaseModel:
        return self.generate(prompt, schema)

    def _complete(self, prompt: str) -> str:
        body: dict[str, Any] = {
            "model": self.config.model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "user", "content": prompt}],
        }
        if self.config.fallback_models:
            body["models"] = [self.config.model, *self.config.fallback_models]
        headers = {"authorization": f"Bearer {self.config.api_key}", "content-type": "application/json"}

        for attempt, backoff in enumerate((*RETRY_BACKOFF_S, None)):
            res = self.client.post("/chat/completions", json=body, headers=headers)
            if res.status_code == 429:
                if backoff is None or "per-day" in res.text or "daily" in res.text:
                    raise RateLimited(f"judge rate limited after {attempt} retries: {res.text[:200]}")
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
            self.served_model = payload.get("model") or self.config.model
            content = (choices[0].get("message") or {}).get("content") or ""
            if not content.strip():
                raise JudgeError("judge returned an empty response")
            return content
        raise JudgeError("judge exhausted retries")


# Rubric anchors for correctness against the reference. The same four levels
# were used to calibrate the thresholds, so a judge swap can be re-checked
# against a fixed scale rather than free-form criteria.
CORRECTNESS_RUBRIC = [
    Rubric(
        score_range=(10, 10),
        expected_outcome="Every fact stated in the expected output is present in the actual output and matches (numbers, windows, yes/no verdicts). Extra correct detail is fine.",
    ),
    Rubric(
        score_range=(7, 9),
        expected_outcome="The verdict and the main figure match the expected output, but a secondary fact from the expected output is missing.",
    ),
    Rubric(
        score_range=(3, 6),
        expected_outcome="The verdict matches but a stated figure is wrong, or the verdict is hedged where the expected output is definite.",
    ),
    Rubric(
        score_range=(0, 2),
        expected_outcome="The verdict contradicts the expected output, or a central figure is wrong.",
    ),
]


def relevancy_metric(judge: DeepEvalBaseLLM) -> AnswerRelevancyMetric:
    return AnswerRelevancyMetric(threshold=RELEVANCY_THRESHOLD, model=judge, async_mode=False)


def correctness_metric(judge: DeepEvalBaseLLM) -> GEval:
    # Explicit steps rather than `criteria`: GEval otherwise asks the judge to
    # write its own steps first, which is one more model call per case and one
    # more JSON payload a small model can get wrong.
    return GEval(
        name="Correctness",
        evaluation_steps=[
            "List every fact the expected output states: numbers, time windows, and yes/no verdicts.",
            "For each fact, check whether the actual output states it and whether it matches; extra correct detail in the actual output is neither rewarded nor penalised.",
            "Ignore any trailing AI disclaimer in the actual output, and do not reward confident prose.",
            "Score on the rubric using the worst applicable band: contradiction or a wrong central figure is the lowest band, a hedged verdict or a wrong secondary figure the next, a missing secondary fact the next, and full agreement the top band.",
        ],
        rubric=CORRECTNESS_RUBRIC,
        evaluation_params=[SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT, SingleTurnParams.EXPECTED_OUTPUT],
        model=judge,
        threshold=CORRECTNESS_THRESHOLD,
        async_mode=False,
    )


def load_goldens(dataset: Path) -> list[Golden]:
    """Every chat case that carries a reference answer becomes a DeepEval golden."""
    goldens = []
    for raw in dataset.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        c = json.loads(raw)
        if c["endpoint"] != "chat" or not c.get("reference"):
            continue
        goldens.append(
            Golden(
                input=c["input"]["message"],
                expected_output=c["reference"],
                additional_metadata={"id": c["id"], "category": c["category"], "why": c["why"]},
            )
        )
    return goldens
