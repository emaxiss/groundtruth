"""The harness mirrors three things from the app. These tests fail when the app's side moves."""

from __future__ import annotations

import re
from pathlib import Path

from harness.contract import DISCLAIMER, MODEL_HEADER, TRIAGE_ENUMS

ROOT = Path(__file__).resolve().parents[2]


def source(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_triage_enums_match_the_zod_schema() -> None:
    schema = source("lib/schemas.ts")
    for field, allowed in TRIAGE_ENUMS.items():
        declared = re.search(rf"{field}: z\.enum\(\[(.*?)\]\)", schema)
        assert declared, f"{field} enum not found in lib/schemas.ts"
        assert set(re.findall(r"'([^']+)'", declared.group(1))) == allowed


def test_disclaimer_is_a_prefix_of_the_apps_disclaimer() -> None:
    declared = re.search(r"AI_DISCLAIMER =\s*'([^']+)'", source("lib/prompts.ts"))
    assert declared and declared.group(1).startswith(DISCLAIMER)


def test_model_header_matches_the_client() -> None:
    assert f"MODEL_HEADER = '{MODEL_HEADER}'" in source("lib/llm/client.ts")
