"""The golden dataset as typed cases."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

EVALS_DIR = Path(__file__).resolve().parents[1]
DATASET = EVALS_DIR / "dataset.jsonl"
DEFAULT_RESULTS_DIR = EVALS_DIR / "results"


@dataclass(frozen=True)
class Case:
    id: str
    category: str
    endpoint: str
    input: dict[str, Any]
    expected: dict[str, Any]
    reference: str | None
    why: str


def load_cases(path: Path = DATASET) -> list[Case]:
    cases = []
    for raw in path.read_text(encoding="utf-8").splitlines():
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
