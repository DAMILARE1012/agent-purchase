"""Model prices (USD per million tokens), from LLM_PRICES. Check Groq's pricing page: defaults are placeholders."""

from functools import lru_cache

from app.config import get_settings


@lru_cache
def _prices() -> dict[str, tuple[float, float]]:
    out: dict[str, tuple[float, float]] = {}
    for entry in get_settings().llm_prices.split(";"):
        if "=" not in entry:
            continue
        model, rates = entry.split("=", 1)
        inp, outp = rates.split("/")
        out[model.strip()] = (float(inp), float(outp))
    return out


def cost_micro_usd(model: str, tokens_in: int, tokens_out: int) -> int:
    """Cost in micro-dollars (1e-6 USD). Unknown models cost 0 and are visible as such in the log."""
    inp, outp = _prices().get(model, (0.0, 0.0))
    return round(tokens_in * inp + tokens_out * outp)  # $/1M tokens × tokens = micro-dollars
