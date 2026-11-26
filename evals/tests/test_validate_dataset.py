"""The dataset's shape rules: a pinned total and no thin category."""

from __future__ import annotations

from tools.validate_dataset import CATEGORIES, EXPECTED_TOTAL, MIN_PER_CATEGORY, count_problems


def cases(per_category: dict[str, int]) -> list[dict[str, str]]:
    return [{"id": f"{cat}-{i}", "category": cat} for cat, n in per_category.items() for i in range(n)]


def balanced() -> dict[str, int]:
    counts = dict.fromkeys(sorted(CATEGORIES), MIN_PER_CATEGORY)
    counts["triage"] += EXPECTED_TOTAL - sum(counts.values())
    return counts


def test_a_category_may_hold_more_than_the_minimum() -> None:
    assert count_problems(cases(balanced())) == []


def test_a_thin_category_is_a_problem_even_when_the_total_holds() -> None:
    counts = balanced()
    counts["edge"] -= 1
    counts["factual"] += 1
    assert count_problems(cases(counts)) == [
        f"category 'edge' has {MIN_PER_CATEGORY - 1} cases, at least {MIN_PER_CATEGORY} expected"
    ]


def test_a_deleted_case_is_a_problem() -> None:
    counts = balanced()
    counts["triage"] -= 1
    assert count_problems(cases(counts)) == [f"expected {EXPECTED_TOTAL} cases, found {EXPECTED_TOTAL - 1}"]
