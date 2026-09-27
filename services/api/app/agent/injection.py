"""
Prompt-injection screening of seller content: a monitoring signal, never a control.

This is a transparent heuristic (phrases that address AI assistants or give
instructions). A classifier model such as Llama Prompt Guard 2 can replace it
behind the same function; the gate never relies on either (system_design.md §5).
"""

import re

_PATTERNS: list[tuple[re.Pattern[str], float]] = [
    (re.compile(r"\b(ai|shopping)\s+(assistant|agent)s?\b", re.I), 0.9),
    (re.compile(r"\bnote to (the )?(ai|assistant|agent|model)\b", re.I), 0.95),
    (re.compile(r"\bignore (all |any |the )?(previous|prior|above|other) (instructions|rules)\b", re.I), 0.95),
    (re.compile(r"\b(always|must) (prefer|choose|pick|buy|add)\b", re.I), 0.7),
    (re.compile(r"\bsystem prompt\b", re.I), 0.9),
    (re.compile(r"\b(verified|official|trusted) (seller|store|by the platform)\b", re.I), 0.6),
    (re.compile(r"\badd \d+ (units|more)\b", re.I), 0.5),
]


def score(*texts: str | None) -> float:
    """0 (plain product text) to 1 (clearly addressed to an AI)."""
    best = 0.0
    for text in texts:
        if not text:
            continue
        for pattern, weight in _PATTERNS:
            if pattern.search(text):
                best = max(best, weight)
    return best
