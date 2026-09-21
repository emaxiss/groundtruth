#!/usr/bin/env python3
"""Summarise judge scores across the most recent judge-tier reports.

Prints, per case and metric, the min / mean / max over the runs, and the
lowest score seen anywhere. Thresholds should sit at or below that floor
for a set of runs the author has read and agrees with; a threshold above
it would fail an answer the judge itself approved on another day.

Usage: python3 evals/tools/judge_spread.py [--runs N] [--dir evals/results]
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path


def load_judge_reports(results_dir: Path, runs: int) -> list[dict]:
    reports = []
    for path in sorted(results_dir.glob("*.json"), reverse=True):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if data.get("tier") == "judge":
            data["_path"] = path.name
            reports.append(data)
        if len(reports) == runs:
            break
    return list(reversed(reports))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--dir", default=str(Path(__file__).resolve().parents[1] / "results"))
    args = ap.parse_args()

    reports = load_judge_reports(Path(args.dir), args.runs)
    if not reports:
        print("no judge-tier reports found")
        return 1

    per_case: dict[str, dict[str, list[float]]] = {}
    judges: set[str] = set()
    for r in reports:
        for c in r["cases"]:
            s = c.get("scores") or {}
            if "relevancy" not in s:
                continue
            judges.add(s.get("judge_model") or "?")
            bucket = per_case.setdefault(c["id"], {"relevancy": [], "correctness": []})
            bucket["relevancy"].append(float(s["relevancy"]))
            bucket["correctness"].append(float(s["correctness"]))

    print(f"{len(reports)} judge run(s): {', '.join(r['_path'] for r in reports)}")
    print(f"judge model(s): {', '.join(sorted(judges))}")
    print(f"{'case':<13} {'relevancy min/mean/max':<26} {'correctness min/mean/max':<26} n")
    floor = {"relevancy": 1.0, "correctness": 1.0}
    for case_id, m in sorted(per_case.items()):
        cols = []
        for metric in ("relevancy", "correctness"):
            v = m[metric]
            floor[metric] = min(floor[metric], min(v))
            cols.append(f"{min(v):.2f} / {statistics.mean(v):.2f} / {max(v):.2f}")
        print(f"{case_id:<13} {cols[0]:<26} {cols[1]:<26} {len(m['relevancy'])}")
    print(f"\nlowest observed: relevancy {floor['relevancy']:.2f}, correctness {floor['correctness']:.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
