"""The assertion text normaliser. No app needed."""

from __future__ import annotations

import re

from test_deterministic import normalize


def test_narrow_no_break_space_between_number_and_unit_matches_a_plain_regex() -> None:
    # Observed live: the model rendered "7 days" with U+202F, and `7 days`
    # silently failed to match.
    raw = "expires after\u202f7\u202fdays"
    assert re.search(r"7 days", raw) is None
    assert re.search(r"7 days", normalize(raw)) is not None


def test_non_breaking_hyphen_folds_to_ascii() -> None:
    assert normalize("24\u2011hour") == "24-hour"
    assert normalize("data\u2010export") == "data-export"


def test_every_documented_space_variant_folds() -> None:
    for codepoint in ("\u00a0", "\u2007", "\u202f", "\u2009", "\u2002", "\u2003"):
        assert normalize(f"7{codepoint}days") == "7 days"


def test_ordinary_text_is_untouched() -> None:
    text = "The Pro plan is $12 per user per month (a 17% discount annually)."
    assert normalize(text) == text
