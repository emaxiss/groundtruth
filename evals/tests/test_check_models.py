"""The model check: a route with nothing listed stops the run, a missing fallback only warns."""

from __future__ import annotations

from tools.check_models import ROUTES, check, routes_from

LISTED = {"agent/a:free", "agent/b:free", "judge/a:free", "judge/b:free"}


def env(**overrides: str) -> dict[str, str]:
    base = {
        "GROUNDTRUTH_MODEL": "agent/a:free",
        "GROUNDTRUTH_FALLBACK_MODELS": "agent/b:free",
        "GROUNDTRUTH_JUDGE_MODEL": "judge/a:free",
        "GROUNDTRUTH_JUDGE_FALLBACK_MODELS": "judge/b:free",
    }
    return {**base, **overrides}


def test_routes_list_the_primary_first_and_skip_blank_entries() -> None:
    routes = routes_from(env(GROUNDTRUTH_FALLBACK_MODELS=" agent/b:free, ,agent/c:free "))
    assert routes == {
        "agent": ["agent/a:free", "agent/b:free", "agent/c:free"],
        "judge": ["judge/a:free", "judge/b:free"],
    }


def test_an_unset_route_is_left_out() -> None:
    routes = routes_from({"GROUNDTRUTH_MODEL": "agent/a:free"})
    assert routes == {"agent": ["agent/a:free"]}


def test_every_model_listed_is_clean() -> None:
    assert check(routes_from(env()), LISTED) == ([], [])


def test_a_missing_fallback_warns_and_names_it() -> None:
    errors, warnings = check(routes_from(env(GROUNDTRUTH_JUDGE_FALLBACK_MODELS="judge/b:free,gone/x:free")), LISTED)
    assert errors == []
    assert warnings == ["judge route: gone/x:free is not offered any more"]


def test_a_missing_primary_warns_while_a_fallback_can_answer() -> None:
    errors, warnings = check(routes_from(env(GROUNDTRUTH_MODEL="gone/x:free")), LISTED)
    assert errors == []
    assert warnings == ["agent route: gone/x:free is not offered any more"]


def test_a_route_with_nothing_listed_is_an_error() -> None:
    routes = routes_from(env(GROUNDTRUTH_MODEL="gone/x:free", GROUNDTRUTH_FALLBACK_MODELS="gone/y:free"))
    errors, warnings = check(routes, LISTED)
    assert errors == ["agent route: none of gone/x:free, gone/y:free is offered, nothing can answer"]
    assert warnings == []


def test_both_routes_are_checked() -> None:
    assert set(ROUTES) == {"agent", "judge"}
