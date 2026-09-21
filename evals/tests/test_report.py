"""Unit tests for the report arithmetic. No app needed."""

from __future__ import annotations

import json
from pathlib import Path

from harness.report import (
    CaseResult,
    Report,
    compare,
    compute_delta,
    format_delta,
    format_report,
    previous_report,
    served_models,
    summarize,
    write_report,
)


def case(id: str, category: str, outcome: str) -> CaseResult:
    score = {"passed": 1.0, "failed": 0.0}.get(outcome)
    return CaseResult(id=id, category=category, endpoint="chat", outcome=outcome, score=score, duration_ms=1)


def report(cases: list[CaseResult], tier: str = "deterministic") -> Report:
    return Report(
        run_at="2026-01-01T00:00:00+00:00",
        tier=tier,
        app_url="http://x",
        model=None,
        fake_llm=True,
        paid_models_allowed=False,
        cases=cases,
    )


def as_dict(r: Report) -> dict:
    return json.loads(r.to_json())


def test_summary_excludes_unavailable_from_the_pass_rate() -> None:
    s = summarize([case("a", "edge", "passed"), case("b", "edge", "unavailable")])
    assert s["unavailable"] == 1
    assert s["scored"] == 1
    assert s["pass_rate"] == 1.0


def test_summary_excludes_rate_limited_from_the_pass_rate() -> None:
    s = summarize([case("a", "edge", "passed"), case("b", "edge", "failed"), case("c", "edge", "rate_limited")])
    assert s["total"] == 3
    assert s["scored"] == 2
    assert s["rate_limited"] == 1
    assert s["pass_rate"] == 0.5


def test_summary_with_nothing_scored_has_no_rate() -> None:
    assert summarize([case("a", "edge", "rate_limited")])["pass_rate"] is None


def test_delta_reports_new_failures_fixed_and_rate_change() -> None:
    before = as_dict(report([case("a", "edge", "passed"), case("b", "edge", "failed"), case("c", "factual", "passed")]))
    after = as_dict(report([case("a", "edge", "failed"), case("b", "edge", "passed"), case("c", "factual", "passed")]))
    d = compute_delta(before, after)
    assert d["new_failures"] == ["a"]
    assert d["fixed"] == ["b"]
    assert d["still_failing"] == []
    assert d["overall"]["change"] == 0.0
    assert d["categories"]["edge"]["change"] == 0.0
    assert d["categories"]["factual"]["change"] == 0.0


def test_delta_tracks_a_category_regression() -> None:
    before = as_dict(report([case("a", "edge", "passed"), case("b", "edge", "passed"), case("c", "factual", "passed")]))
    after = as_dict(report([case("a", "edge", "passed"), case("b", "edge", "failed"), case("c", "factual", "passed")]))
    d = compute_delta(before, after)
    assert d["new_failures"] == ["b"]
    assert d["categories"]["edge"] == {"before": 1.0, "after": 0.5, "change": -0.5}
    assert d["categories"]["factual"]["change"] == 0.0
    assert round(d["overall"]["change"], 4) == round(2 / 3 - 1, 4)


def test_delta_lists_added_and_removed_cases_without_counting_them_as_changes() -> None:
    before = as_dict(report([case("a", "edge", "passed"), case("old", "edge", "failed")]))
    after = as_dict(report([case("a", "edge", "passed"), case("new", "edge", "failed")]))
    d = compute_delta(before, after)
    assert d["added"] == ["new"]
    assert d["removed"] == ["old"]
    assert d["new_failures"] == []
    assert d["fixed"] == []


def test_previous_report_picks_the_latest_of_the_same_tier_and_model(tmp_path: Path) -> None:
    (tmp_path / "2026-01-01T00-00-00Z.json").write_text(json.dumps({"tier": "deterministic", "model": "fake"}))
    (tmp_path / "2026-01-02T00-00-00Z.json").write_text(json.dumps({"tier": "judge", "model": "fake"}))
    (tmp_path / "2026-01-03T00-00-00Z.json").write_text(json.dumps({"tier": "deterministic", "model": "fake"}))
    (tmp_path / "2026-01-04T00-00-00Z.json").write_text(json.dumps({"tier": "deterministic", "model": "live/x"}))
    current = tmp_path / "2026-01-05T00-00-00Z.json"
    current.write_text(json.dumps({"tier": "deterministic", "model": "fake"}))
    assert previous_report(tmp_path, current, "deterministic", "fake") == tmp_path / "2026-01-03T00-00-00Z.json"
    assert previous_report(tmp_path, current, "deterministic", "live/x") == tmp_path / "2026-01-04T00-00-00Z.json"
    assert previous_report(tmp_path, current, "judge", "fake") == tmp_path / "2026-01-02T00-00-00Z.json"
    assert previous_report(tmp_path, current, "deterministic", "live/y") is None
    (tmp_path / "2026-01-06T00-00-00Z.json").write_text("not json")
    assert previous_report(tmp_path, current, "deterministic", "fake") == tmp_path / "2026-01-03T00-00-00Z.json"


def test_write_report_never_overwrites_within_the_same_second(tmp_path: Path) -> None:
    r = report([case("a", "edge", "passed")])
    first = write_report(r, tmp_path)
    second = write_report(r, tmp_path)
    assert first != second
    assert first.exists() and second.exists()
    data = json.loads(first.read_text())
    assert data["totals"]["passed"] == 1
    assert data["cases"][0]["id"] == "a"


def test_formatting_is_readable_and_names_the_regression(tmp_path: Path) -> None:
    before = as_dict(report([case("a", "edge", "passed"), case("b", "edge", "passed")]))
    after = as_dict(report([case("a", "edge", "passed"), case("b", "edge", "failed")]))
    lines = format_report(after, tmp_path / "now.json")
    assert lines[1].startswith("tier: deterministic · model: fake · 2 cases · 1 passed, 1 failed")
    assert any(line.strip().startswith("edge") and "50.0%" in line for line in lines)
    delta_lines = format_delta(compute_delta(before, after), tmp_path / "prev.json")
    assert delta_lines[0] == "delta vs prev.json:"
    assert "new failures:  b" in delta_lines[1]
    assert "overall: 100.0% -> 50.0% (-50.0)" in delta_lines[3]
    assert format_delta(None, None) == ["delta: no previous run of this tier to compare against"]


def test_served_models_counts_most_frequent_first() -> None:
    cases = [
        {"served_model": "a"},
        {"served_model": "b"},
        {"served_model": "b"},
        {"served_model": None},
    ]
    assert served_models(cases) == {"b": 2, "a": 1}
    assert served_models([{"served_model": None}]) == {}


def test_readme_example_matches_saved_pair() -> None:
    """The worked example in the README is the output of `harness/report.py` on the checked-in pair."""
    root = Path(__file__).resolve().parents[2]
    readme = (root / "README.md").read_text(encoding="utf-8")
    marker = "$ python3 evals/harness/report.py evals/examples/baseline.json evals/examples/regression.json\n"
    start = readme.index(marker) + len(marker)
    printed = readme[start : readme.index("```", start)]
    expected = compare(Path("evals/examples/baseline.json"), Path("evals/examples/regression.json"))
    assert printed == "\n".join(expected) + "\n"
