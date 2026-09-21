"""Run reports and run-over-run deltas.

Pure functions only: the pytest hooks in conftest.py feed them outcomes and
print what they return, so the arithmetic is testable without an app.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

OUTCOMES = ("passed", "failed", "rate_limited", "unavailable", "skipped")


@dataclass(frozen=True)
class CaseResult:
    id: str
    category: str
    endpoint: str
    outcome: str  # one of OUTCOMES
    score: float | None  # 1.0 / 0.0 for deterministic cases, judge score later
    duration_ms: int
    message: str | None = None
    served_model: str | None = None
    scores: dict[str, Any] | None = None  # judge tier: relevancy, correctness, judge_model


@dataclass
class Report:
    run_at: str
    tier: str
    app_url: str
    model: str | None
    fake_llm: bool | None
    paid_models_allowed: bool | None
    cases: list[CaseResult]
    categories: dict[str, dict[str, Any]] = field(default_factory=dict)
    totals: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.categories = summarize_by_category(self.cases)
        self.totals = summarize(self.cases)

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2) + "\n"


def summarize(cases: list[CaseResult]) -> dict[str, Any]:
    counts = {o: sum(1 for c in cases if c.outcome == o) for o in OUTCOMES}
    scored = counts["passed"] + counts["failed"]
    rate = counts["passed"] / scored if scored else None
    return {**counts, "total": len(cases), "scored": scored, "pass_rate": rate}


def summarize_by_category(cases: list[CaseResult]) -> dict[str, dict[str, Any]]:
    by_cat: dict[str, list[CaseResult]] = {}
    for c in cases:
        by_cat.setdefault(c.category, []).append(c)
    return {cat: summarize(items) for cat, items in sorted(by_cat.items())}


def timestamp_slug(now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H-%M-%SZ")


def write_report(report: Report, results_dir: Path) -> Path:
    results_dir.mkdir(parents=True, exist_ok=True)
    path = results_dir / f"{timestamp_slug()}.json"
    # Two runs inside the same second would collide; suffix rather than overwrite.
    n = 1
    while path.exists():
        n += 1
        path = results_dir / f"{timestamp_slug()}-{n}.json"
    path.write_text(report.to_json(), encoding="utf-8")
    return path


def previous_report(results_dir: Path, current: Path, tier: str, model: str | None = None) -> Path | None:
    """Most recent report of the same tier and model, excluding the one just written.

    A fake-mode run is never the baseline for a live run: the two measure
    different things, and the delta between them would say nothing about the
    last prompt edit.
    """
    candidates = sorted(p for p in results_dir.glob("*.json") if p != current)
    for path in reversed(candidates):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if data.get("tier") == tier and data.get("model") == model:
            return path
    return None


def load_report(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def compute_delta(previous: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    prev_cases = {c["id"]: c for c in previous["cases"]}
    curr_cases = {c["id"]: c for c in current["cases"]}

    def failing(c: dict[str, Any]) -> bool:
        return c["outcome"] == "failed"

    common = sorted(set(prev_cases) & set(curr_cases))
    new_failures = [i for i in common if not failing(prev_cases[i]) and failing(curr_cases[i])]
    fixed = [i for i in common if failing(prev_cases[i]) and not failing(curr_cases[i])]
    still_failing = [i for i in common if failing(prev_cases[i]) and failing(curr_cases[i])]
    added = sorted(set(curr_cases) - set(prev_cases))
    removed = sorted(set(prev_cases) - set(curr_cases))

    def rate(summary: dict[str, Any] | None) -> float | None:
        return None if summary is None else summary.get("pass_rate")

    categories = {}
    for cat in sorted(set(previous["categories"]) | set(current["categories"])):
        before = rate(previous["categories"].get(cat))
        after = rate(current["categories"].get(cat))
        categories[cat] = {"before": before, "after": after, "change": _change(before, after)}

    before_total = rate(previous["totals"])
    after_total = rate(current["totals"])
    return {
        "new_failures": new_failures,
        "fixed": fixed,
        "still_failing": still_failing,
        "added": added,
        "removed": removed,
        "overall": {"before": before_total, "after": after_total, "change": _change(before_total, after_total)},
        "categories": categories,
    }


def _change(before: float | None, after: float | None) -> float | None:
    if before is None or after is None:
        return None
    return round(after - before, 4)


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def _signed(change: float | None) -> str:
    if change is None:
        return ""
    sign = "+" if change > 0 else ""
    return f" ({sign}{change * 100:.1f})"


def format_report(report: dict[str, Any], path: Path) -> list[str]:
    totals = report["totals"]
    model = "fake" if report.get("fake_llm") else (report.get("model") or "unknown")
    lines = [
        f"report: {path}",
        f"tier: {report['tier']} · model: {model} · {totals['total']} cases · "
        f"{totals['passed']} passed, {totals['failed']} failed"
        + (f", {totals['rate_limited']} rate limited" if totals["rate_limited"] else "")
        + (f", {totals['unavailable']} unavailable" if totals["unavailable"] else "")
        + f" · pass rate {_pct(totals['pass_rate'])}",
    ]
    for cat, s in report["categories"].items():
        lines.append(f"  {cat:<13} {s['passed']}/{s['scored']:<3} {_pct(s['pass_rate'])}")
    served = served_models(report["cases"])
    if served:
        lines.append("served by: " + ", ".join(f"{m} ×{n}" for m, n in served.items()))
    return lines


def served_models(cases: list[dict[str, Any]]) -> dict[str, int]:
    """Which models actually answered, most frequent first. Empty when unknown."""
    counts: dict[str, int] = {}
    for c in cases:
        m = c.get("served_model")
        if m:
            counts[m] = counts.get(m, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))


def format_delta(delta: dict[str, Any] | None, previous_path: Path | None) -> list[str]:
    if delta is None or previous_path is None:
        return ["delta: no previous run of this tier to compare against"]

    def names(ids: list[str]) -> str:
        return ", ".join(ids) if ids else "none"

    lines = [
        f"delta vs {previous_path.name}:",
        f"  new failures:  {names(delta['new_failures'])}",
        f"  fixed:         {names(delta['fixed'])}",
    ]
    if delta["still_failing"]:
        lines.append(f"  still failing: {names(delta['still_failing'])}")
    if delta["added"] or delta["removed"]:
        lines.append(f"  cases added: {names(delta['added'])} · removed: {names(delta['removed'])}")
    o = delta["overall"]
    lines.append(f"  overall: {_pct(o['before'])} -> {_pct(o['after'])}{_signed(o['change'])}")
    for cat, c in delta["categories"].items():
        if c["change"]:
            lines.append(f"  {cat}: {_pct(c['before'])} -> {_pct(c['after'])}{_signed(c['change'])}")
    return lines


def compare(previous_path: Path, current_path: Path) -> list[str]:
    """The report and delta lines for two saved runs, as the harness prints them."""
    previous, current = load_report(previous_path), load_report(current_path)
    return format_report(current, current_path) + format_delta(compute_delta(previous, current), previous_path)


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 3:
        sys.exit("usage: report.py <previous.json> <current.json>")
    print("\n".join(compare(Path(sys.argv[1]), Path(sys.argv[2]))))
