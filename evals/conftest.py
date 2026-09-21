"""Shared fixtures: dataset loading and an HTTP client against the running app."""

from __future__ import annotations

import json
import os

# DeepEval ships opt-out telemetry (PostHog). Off, unconditionally, before any
# deepeval import; the same variable is set in .env.example and in CI.
os.environ.setdefault("DEEPEVAL_TELEMETRY_OPT_OUT", "1")
# Free judge models are slow; DeepEval's default 180 s per-attempt budget cut
# off two of nine cases on a run where a passing case took 167 s. The judge's
# own retry budget (evals/judge.py) fits inside this figure.
os.environ.setdefault("DEEPEVAL_PER_ATTEMPT_TIMEOUT_SECONDS_OVERRIDE", "300")
from datetime import datetime, timezone
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import pytest

from report import (
    CaseResult,
    Report,
    compute_delta,
    format_delta,
    format_report,
    load_report,
    previous_report,
    write_report,
)

DATASET = Path(__file__).with_name("dataset.jsonl")
DEFAULT_APP_URL = "http://localhost:3000"
DEFAULT_RESULTS_DIR = Path(__file__).with_name("results")


@dataclass(frozen=True)
class Case:
    id: str
    category: str
    endpoint: str
    input: dict[str, Any]
    expected: dict[str, Any]
    reference: str | None
    why: str


def load_cases() -> list[Case]:
    cases = []
    for raw in DATASET.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        c = json.loads(raw)
        cases.append(
            Case(
                id=c["id"],
                category=c["category"],
                endpoint=c["endpoint"],
                input=c["input"],
                expected=c["expected"],
                reference=c.get("reference"),
                why=c["why"],
            )
        )
    return cases


CASES = load_cases()


@pytest.fixture(scope="session")
def app_url() -> str:
    return os.environ.get("GROUNDTRUTH_APP_URL", DEFAULT_APP_URL).rstrip("/")


@pytest.fixture(scope="session")
def client(app_url: str, request: pytest.FixtureRequest) -> httpx.Client:
    with httpx.Client(base_url=app_url, timeout=httpx.Timeout(60.0, connect=5.0)) as c:
        try:
            health = c.get("/api/health")
        except httpx.HTTPError as e:
            pytest.exit(f"app not reachable at {app_url} ({e}); set GROUNDTRUTH_APP_URL", returncode=2)
        if health.status_code != 200:
            pytest.exit(f"/api/health returned {health.status_code} at {app_url}", returncode=2)
        body = health.json()
        # Refuse before the first case rather than after one that was billed.
        if not body.get("all_models_free") and not body.get("paid_models_allowed"):
            pytest.exit(
                f"app at {app_url} is configured with a paid model ({body.get('model')}); "
                "point GROUNDTRUTH_MODEL at a ':free' model or set GROUNDTRUTH_ALLOW_PAID_MODELS=1",
                returncode=2,
            )
        request.config.stash[HEALTH_KEY] = body
        yield c


def pytest_generate_tests(metafunc: pytest.Metafunc) -> None:
    if "case" in metafunc.fixturenames:
        metafunc.parametrize("case", CASES, ids=[c.id for c in CASES])


# --- run reports -----------------------------------------------------------
#
# Every parametrised case records an outcome. At session end the outcomes are
# written to evals/results/<timestamp>.json and compared with the previous run
# of the same tier and model.

HEALTH_KEY = pytest.StashKey[dict[str, Any]]()
RESULTS_KEY = pytest.StashKey[list[CaseResult]]()
REPORT_KEY = pytest.StashKey[list[str]]()


def pytest_configure(config: pytest.Config) -> None:
    config.stash[RESULTS_KEY] = []
    config.stash[REPORT_KEY] = []


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item: pytest.Item, call: pytest.CallInfo[None]):
    outcome = yield
    rep: pytest.TestReport = outcome.get_result()
    if rep.when != "call" or not hasattr(item, "callspec"):
        return
    case = item.callspec.params.get("case")
    golden = item.callspec.params.get("golden")
    if case is None and golden is not None:
        meta = getattr(golden, "additional_metadata", None) or {}
        case = next((c for c in CASES if c.id == meta.get("id")), None)
    if not isinstance(case, Case):
        return
    if call.excinfo is not None and call.excinfo.typename in ("JudgeError", "TimeoutError"):
        # The judge failed to score (or timed out), which says nothing about the agent.
        item.config.stash[RESULTS_KEY].append(
            CaseResult(
                id=case.id,
                category=case.category,
                endpoint=case.endpoint,
                outcome="skipped",
                score=None,
                duration_ms=int(rep.duration * 1000),
                message=f"judge error: {call.excinfo.value}"[:300],
                served_model=dict(rep.user_properties).get("served_model"),
            )
        )
        return

    props = dict(rep.user_properties)
    recorded = props.get("score")
    if rep.passed:
        result, message = "passed", props.get("rationale")
        score = float(recorded) if recorded is not None else 1.0
    elif rep.skipped:
        result, score, message = "skipped", None, _first_line(rep.longreprtext)
    elif call.excinfo is not None and call.excinfo.typename == "RateLimited":
        result, score, message = "rate_limited", None, str(call.excinfo.value)
    elif call.excinfo is not None and call.excinfo.typename == "ProviderUnavailable":
        result, score, message = "unavailable", None, str(call.excinfo.value)
    else:
        result, message = "failed", _failure_message(rep)
        # A judge-tier failure may have stopped before the correctness metric
        # ran; an unknown score on a failed case is recorded as 0.0.
        score = float(recorded) if recorded is not None else 0.0

    item.config.stash[RESULTS_KEY].append(
        CaseResult(
            id=case.id,
            category=case.category,
            endpoint=case.endpoint,
            outcome=result,
            score=score,
            duration_ms=int(rep.duration * 1000),
            message=message,
            served_model=props.get("served_model"),
            scores=props.get("scores"),
        )
    )


def _first_line(text: str) -> str | None:
    return text.strip().splitlines()[0][:300] if text.strip() else None


def _failure_message(rep: pytest.TestReport) -> str | None:
    crash = getattr(rep.longrepr, "reprcrash", None)
    if crash is not None and crash.message:
        return crash.message.splitlines()[0][:300]
    return _first_line(rep.longreprtext) or "failed"


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    config = session.config
    results = config.stash.get(RESULTS_KEY, [])
    if not results:
        return
    health = config.stash.get(HEALTH_KEY, {})
    tier = "judge" if "judge" in (config.option.markexpr or "") and "not judge" not in (config.option.markexpr or "") else "deterministic"
    results_dir = Path(os.environ.get("GROUNDTRUTH_RESULTS_DIR", DEFAULT_RESULTS_DIR))

    report = Report(
        run_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        tier=tier,
        app_url=os.environ.get("GROUNDTRUTH_APP_URL", DEFAULT_APP_URL).rstrip("/"),
        model=health.get("model"),
        fake_llm=health.get("fake_llm"),
        paid_models_allowed=health.get("paid_models_allowed"),
        cases=results,
    )
    path = write_report(report, results_dir)
    current = load_report(path)
    prev_path = previous_report(results_dir, path, tier, current.get("model"))
    delta = compute_delta(load_report(prev_path), current) if prev_path else None

    lines = config.stash[REPORT_KEY]
    lines.extend(format_report(current, _display_path(path)))
    lines.extend(format_delta(delta, prev_path))


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(Path.cwd())
    except ValueError:
        return path


def pytest_terminal_summary(terminalreporter: Any, exitstatus: int, config: pytest.Config) -> None:
    lines = config.stash.get(REPORT_KEY, [])
    if not lines:
        return
    terminalreporter.section("groundtruth run report")
    for line in lines:
        terminalreporter.write_line(line)
