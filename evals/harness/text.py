"""Text normalisation applied before any regex assertion."""

from __future__ import annotations

# Models emit typographic whitespace and dashes that are invisible in a diff
# but break a plain regex: "7 days" with U+202F between the number and the
# unit does not match `7 days`. Assertions are about content, not about which
# codepoint the model chose to render a space with, so text is normalised
# before matching. Unicode escapes are spelled out rather than pasted so an
# editor that normalises Unicode cannot silently change them.
_WHITESPACE = dict.fromkeys(
    [
        0x00A0,  # no-break space
        0x2007,  # figure space
        0x202F,  # narrow no-break space
        0x2009,  # thin space
        0x2002,  # en space
        0x2003,  # em space
    ],
    " ",
)
_DASHES = dict.fromkeys([0x2010, 0x2011, 0x2012, 0x2013, 0x2014], "-")
_TRANSLATION = {**_WHITESPACE, **_DASHES}


def normalize(text: str) -> str:
    """Fold typographic whitespace and dashes to their ASCII equivalents."""
    return text.translate(_TRANSLATION)
