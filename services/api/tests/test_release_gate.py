"""
The release gate on the committed evaluation reports (evals/reports). This is what makes CI
block a worse agent version: every candidate release must have up-to-date results measured
on the real model, and be no worse than the live release beyond noise.

It calls no model. When it fails because results are out of date, re-run the evaluations
(python -m app.evals run --release <id>) and commit the new report with the prompt change.
"""

import pytest

from app.agent import releases
from app.evals import gate


@pytest.mark.parametrize("candidate", [r.id for r in releases.candidates()] or [releases.live().id])
def test_candidate_passes_the_release_gate(candidate: str):
    live = releases.live().id
    if candidate == live:  # No candidate: the live release's own results must still be current.
        v = gate.verdict(live, live)
    else:
        v = gate.verdict(live, candidate)
    assert v["pass"], f"{candidate} is blocked by the release gate:\n  - " + "\n  - ".join(v["reasons"])
