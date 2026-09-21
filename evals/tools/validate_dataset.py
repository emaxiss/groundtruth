#!/usr/bin/env python3
"""Validate evals/dataset.jsonl: shape, taxonomy balance, and assertion syntax.

Standard library only so it runs anywhere Python 3 does, including the CI
runner before the harness dependencies are installed.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

DATASET = Path(__file__).resolve().parents[1] / "dataset.jsonl"

EXPECTED_TOTAL = 30
CATEGORIES = {"factual", "triage", "out_of_scope", "adversarial", "edge"}
PER_CATEGORY = EXPECTED_TOTAL // len(CATEGORIES)
ID_PREFIX = {
    "factual": "factual-",
    "triage": "triage-",
    "out_of_scope": "scope-",
    "adversarial": "adv-",
    "edge": "edge-",
}
ENDPOINTS = {"chat", "triage"}
CUSTOMER_PLANS = {"free", "pro", "team"}
MAX_MESSAGE = 2000
MAX_SUBJECT = 200

# Mirrors lib/schemas.ts TriageOutput. Kept in sync by hand; a drift here
# fails loudly at validation time rather than silently at eval time.
TRIAGE_ENUMS = {
    "category": {"billing", "bug", "how_to", "feature_request", "account", "abuse"},
    "severity": {"low", "medium", "high", "critical"},
    "route_to": {"support_l1", "support_l2", "engineering", "billing_team", "trust_safety"},
}
REFUND_VALUES = {True, False, "needs_review"}
TOP_LEVEL = {"id", "category", "endpoint", "input", "expected", "reference", "why"}
EXPECTED_KEYS = {
    "status",
    "must_match",
    "must_not_match",
    "schema",
    "category",
    "severity",
    "route_to",
    "refund_eligible",
}


def problems_for(case: dict[str, Any], line_no: int) -> list[str]:
    errs: list[str] = []
    where = f"line {line_no} ({case.get('id', '?')})"

    unknown = set(case) - TOP_LEVEL
    if unknown:
        errs.append(f"{where}: unknown fields {sorted(unknown)}")
    for key in ("id", "category", "endpoint", "input", "expected", "why"):
        if key not in case:
            errs.append(f"{where}: missing '{key}'")
    if errs:
        return errs

    cat, endpoint, inp, exp = case["category"], case["endpoint"], case["input"], case["expected"]
    if cat not in CATEGORIES:
        errs.append(f"{where}: category '{cat}' not in {sorted(CATEGORIES)}")
    elif not case["id"].startswith(ID_PREFIX[cat]):
        errs.append(f"{where}: id should start with '{ID_PREFIX[cat]}' for category '{cat}'")
    if endpoint not in ENDPOINTS:
        errs.append(f"{where}: endpoint '{endpoint}' not in {sorted(ENDPOINTS)}")
    if not isinstance(case["why"], str) or not case["why"].strip():
        errs.append(f"{where}: 'why' must be a non-empty string")

    if endpoint == "chat":
        msg = inp.get("message")
        if set(inp) != {"message"} or not isinstance(msg, str):
            errs.append(f"{where}: chat input must be exactly {{'message': str}}")
        elif not msg.strip() or len(msg) > MAX_MESSAGE:
            errs.append(f"{where}: message must be 1..{MAX_MESSAGE} characters, got {len(msg)}")
        if "schema" in exp or any(k in exp for k in TRIAGE_ENUMS) or "refund_eligible" in exp:
            errs.append(f"{where}: chat cases cannot carry triage field assertions")
    elif endpoint == "triage":
        if set(inp) != {"subject", "body", "customer_plan"}:
            errs.append(f"{where}: triage input must be subject, body, customer_plan")
        else:
            if not (0 < len(inp["subject"].strip()) <= MAX_SUBJECT):
                errs.append(f"{where}: subject must be 1..{MAX_SUBJECT} characters")
            if not (0 < len(inp["body"].strip()) <= MAX_MESSAGE):
                errs.append(f"{where}: body must be 1..{MAX_MESSAGE} characters")
            if inp["customer_plan"] not in CUSTOMER_PLANS:
                errs.append(f"{where}: customer_plan '{inp['customer_plan']}' not in {sorted(CUSTOMER_PLANS)}")
        if exp.get("schema") != "TriageOutput":
            errs.append(f"{where}: triage cases must assert schema 'TriageOutput'")
        for field, allowed in TRIAGE_ENUMS.items():
            if field in exp:
                values = exp[field] if isinstance(exp[field], list) else [exp[field]]
                bad = [v for v in values if v not in allowed]
                if bad:
                    errs.append(f"{where}: {field} value(s) {bad} not in {sorted(allowed)}")
        if "refund_eligible" in exp and exp["refund_eligible"] not in REFUND_VALUES:
            errs.append(f"{where}: refund_eligible must be true, false, or 'needs_review'")

    unknown_exp = set(exp) - EXPECTED_KEYS
    if unknown_exp:
        errs.append(f"{where}: unknown expected keys {sorted(unknown_exp)}")
    if exp.get("status") != 200:
        errs.append(f"{where}: expected.status must be 200 (error-path cases live in route tests)")
    for key in ("must_match", "must_not_match"):
        for pattern in exp.get(key, []):
            try:
                re.compile(pattern)
            except re.error as e:
                errs.append(f"{where}: {key} pattern {pattern!r} does not compile: {e}")
    if not any(k in exp for k in ("must_match", "must_not_match", "schema")):
        errs.append(f"{where}: expected carries no assertion beyond status")

    if cat == "factual" and not case.get("reference"):
        errs.append(f"{where}: factual cases need a reference answer for the judge tier")
    if "reference" in case and (not isinstance(case["reference"], str) or not case["reference"].strip()):
        errs.append(f"{where}: reference must be a non-empty string when present")

    return errs


def main() -> int:
    if not DATASET.exists():
        print(f"missing {DATASET}", file=sys.stderr)
        return 1

    cases: list[dict[str, Any]] = []
    errors: list[str] = []
    for line_no, raw in enumerate(DATASET.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            errors.append(f"line {line_no}: blank line")
            continue
        try:
            case = json.loads(raw)
        except json.JSONDecodeError as e:
            errors.append(f"line {line_no}: invalid JSON ({e})")
            continue
        cases.append(case)
        errors.extend(problems_for(case, line_no))

    ids = [str(c.get("id")) for c in cases]
    dupes = sorted({i for i, n in Counter(ids).items() if n > 1})
    if dupes:
        errors.append(f"duplicate ids: {dupes}")

    if len(cases) != EXPECTED_TOTAL:
        errors.append(f"expected {EXPECTED_TOTAL} cases, found {len(cases)}")
    by_cat = Counter(c.get("category") for c in cases)
    for cat in sorted(CATEGORIES):
        if by_cat.get(cat, 0) != PER_CATEGORY:
            errors.append(f"category '{cat}' has {by_cat.get(cat, 0)} cases, expected {PER_CATEGORY}")

    longest = max(
        (c for c in cases if c.get("endpoint") == "chat"), key=lambda c: len(c["input"]["message"]), default=None
    )
    if longest is None or len(longest["input"]["message"]) != MAX_MESSAGE:
        errors.append(f"no chat case sits exactly at the {MAX_MESSAGE}-character limit")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"\ndataset: FAIL ({len(errors)} problem(s))", file=sys.stderr)
        return 1

    print(f"{len(cases)} cases, {len(set(ids))} unique ids")
    for cat in sorted(CATEGORIES):
        print(f"  {cat:<13} {by_cat[cat]}")
    print("dataset: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
