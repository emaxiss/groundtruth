#!/usr/bin/env python3
"""Check that every configured model is still offered by the provider.

Free models get retired without notice. A route whose models are all gone
spends the whole live run on retries, so it stops the run here instead. A
missing model with another one still offered on its route is a warning.

Reads the same environment variables as the app and the harness. The model
list is public; no key is sent. Standard library only.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from collections.abc import Mapping

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
ROUTES = {
    "agent": ("GROUNDTRUTH_MODEL", "GROUNDTRUTH_FALLBACK_MODELS"),
    "judge": ("GROUNDTRUTH_JUDGE_MODEL", "GROUNDTRUTH_JUDGE_FALLBACK_MODELS"),
}


def routes_from(environ: Mapping[str, str]) -> dict[str, list[str]]:
    routes: dict[str, list[str]] = {}
    for name, (primary, fallbacks) in ROUTES.items():
        models = [environ.get(primary, ""), *environ.get(fallbacks, "").split(",")]
        listed = [m.strip() for m in models if m.strip()]
        if listed:
            routes[name] = listed
    return routes


def check(routes: Mapping[str, list[str]], offered: set[str]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    for name, models in routes.items():
        missing = [m for m in models if m not in offered]
        if len(missing) == len(models):
            errors.append(f"{name} route: none of {', '.join(models)} is offered, nothing can answer")
        else:
            warnings += [f"{name} route: {m} is not offered any more" for m in missing]
    return errors, warnings


def offered_models(base_url: str) -> set[str]:
    with urllib.request.urlopen(f"{base_url.rstrip('/')}/models", timeout=30) as response:
        return {model["id"] for model in json.load(response)["data"]}


def main() -> int:
    routes = routes_from(os.environ)
    if not routes:
        print("no models configured")
        return 1
    errors, warnings = check(routes, offered_models(os.environ.get("GROUNDTRUTH_BASE_URL", DEFAULT_BASE_URL)))
    # On GitHub Actions the lines become annotations on the run page.
    prefix = "::{}::" if os.environ.get("GITHUB_ACTIONS") == "true" else "{}: "
    for line in warnings:
        print(prefix.format("warning") + line)
    for line in errors:
        print(prefix.format("error") + line)
    if not errors:
        print(f"ok: {sum(len(m) for m in routes.values())} models checked, {len(warnings)} missing")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
