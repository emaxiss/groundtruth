"""The parts of the app contract the harness asserts on. Mirrors lib/ in the app."""

DISCLAIMER = "AI-generated, may contain errors"
MODEL_HEADER = "x-groundtruth-model"

# Mirrors lib/schemas.ts TriageOutput.
TRIAGE_ENUMS = {
    "category": {"billing", "bug", "how_to", "feature_request", "account", "abuse"},
    "severity": {"low", "medium", "high", "critical"},
    "route_to": {"support_l1", "support_l2", "engineering", "billing_team", "trust_safety"},
}
