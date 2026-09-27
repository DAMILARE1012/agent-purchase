"""
Evaluation (system_design.md §6, M8): the same test suites for every agent release,
and a release gate that blocks a release that gets worse.

    evals/datasets/   the test sets, reviewed like code
    evals/reports/    one report per release, committed next to the prompts it measured

Suites:
    intent_fidelity   sentences with labelled limits → drafts (intent.compile)
    catalog_reading   every photo catalog in the sandbox marketplace, with exact labels (catalog.read_image)
    shopping_tasks    shopping tasks; the best cart is computed by asking every seller and the gate
    gate_properties   the generated gate tests (tests/test_gate_properties.py)

Every suite result carries a fingerprint of what produced it: the prompt texts, models,
model settings, output schemas and test set. The release gate refuses results whose
fingerprint no longer matches the release (a prompt changed since it was measured), so
CI can check committed reports without calling the model. Results with an identical
fingerprint are reused across releases instead of paying for the same answers twice.

Run inside the api container (see README, "Evaluation"):
    python -m app.evals run --release shopper-2026.09.6
    python -m app.evals gate
"""
