"""
Drafting a mandate from the shopper's words with Qwen (intent.compile, M6), and
making sure the draft is never broader than what they said.

1. Qwen fills the fields and quotes, word for word, the part of the request
   that supports each one.
2. Grounding (code): a field survives only if its quote really is in the
   request, and the value is in the quote (the amount, the brand, the date's
   wording...). Anything else is dropped.
3. The rule-based drafter runs too. Where the two disagree, the stricter value
   wins: the lower budget, the earlier deadline, verified sellers only, a brand
   or model constraint rather than none.
4. Whatever is still unknown gets the strictest default and a question.

If the model is unavailable, the rules alone produce the draft, and it says so.
"""

import re
from datetime import UTC, date, datetime, time, timedelta

from app.agent import releases
from app.agent.schemas import INTENT
from app.llm import gateway
from app.llm.gateway import BudgetExceeded, LlmRequest, LlmUnavailable
from app.security import Viewer
from app.services import mandates

WAT = timedelta(hours=1)
CATEGORIES = {"Printer toner", "Printer ink", "Paper", "Stationery", "Data", "Airtime", "Chargers", "Power banks", "Groceries",
              "Medicines", "Diapers", "Cement", "Paint", "Shoes"}
TIME_WORDS = re.compile(r"\b(by|before|on|until|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
                        r"jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}(st|nd|rd|th)?)\b", re.I)
FIELD_TO_LIMIT = {
    "item": "item", "brand": "brand", "model": "model", "category": "category", "quantity": "quantity",
    "max_total_naira": "maxTotalMinor", "max_per_item_naira": "maxPerItemMinor", "seller_rule": "sellerPolicy",
    "deliver_by_date": "deliverBy", "delivery_city": "deliveryCity", "period": "period", "period_cap_naira": "periodCapMinor",
}


def _norm(text: str) -> str:
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", text).strip().lower()


def numbers_in(text: str) -> set[float]:
    """Amounts written in text: 40000, 40,000, ₦40,000.50, 40k, 1.5m, 40 thousand."""
    out = set()
    for m in re.finditer(r"(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?\b", text, re.I):
        n = float(m.group(1).replace(",", ""))
        mult = {"k": 1e3, "thousand": 1e3, "m": 1e6, "million": 1e6}.get((m.group(2) or "").lower(), 1)
        out.add(n * mult)
    return out


def calendar_text(today: date) -> str:
    days = [(today + timedelta(days=i)) for i in range(15)]
    listed = "; ".join(f"{d.strftime('%A')} {d.isoformat()}" for d in days)
    return f"Today is {today.strftime('%A')} {today.isoformat()} (Lagos time). The next two weeks: {listed}."


def ground(output: dict, request: str, today: date) -> tuple[dict, dict]:
    """
    Keeps only the fields whose quote is in the request and supports the value.
    Returns ({field: value}, {field: quote}) for the fields that survive.
    """
    req = _norm(request)
    quotes: dict[str, list[str]] = {}
    for e in output.get("evidence", []):
        q = _norm(e.get("quote", ""))
        if q and q in req:
            quotes.setdefault(e["field"], []).append(e["quote"].strip())
    kept: dict = {}
    used: dict = {}

    def accept(field: str, value, check) -> None:
        for q in quotes.get(field, []):
            if check(q, value):
                kept[field], used[field] = value, q
                return

    def money(q, v):
        return v is not None and v > 0 and any(abs(n - v) < 0.5 for n in numbers_in(q))

    def text_in(q, v):
        return bool(v) and re.sub(r"[\s-]", "", str(v).lower()) in re.sub(r"[\s-]", "", q.lower())

    accept("item", output.get("item"), lambda q, v: bool(v))
    accept("brand", output.get("brand"), text_in)
    accept("model", output.get("model"), text_in)
    accept("category", output.get("category"), lambda q, v: v in CATEGORIES)
    accept("quantity", output.get("quantity"), lambda q, v: isinstance(v, int) and v >= 1 and float(v) in numbers_in(q))
    for f in ("max_total_naira", "max_per_item_naira", "period_cap_naira"):
        accept(f, output.get(f), money)
    accept("seller_rule", output.get("seller_rule"), lambda q, v: (v == "verified_only" and "verified" in q.lower())
           or (v == "verified_and_known" and re.search(r"\b(known|trusted|any|either)\b", q, re.I) is not None))
    accept("delivery_city", output.get("delivery_city"), text_in)
    accept("period", output.get("period"), lambda q, v: v in ("week", "month") and v in q.lower())

    def deadline(q, v):
        try:
            d = date.fromisoformat(v)
        except (TypeError, ValueError):
            return False
        return today < d <= today + timedelta(days=120) and TIME_WORDS.search(q) is not None

    accept("deliver_by_date", output.get("deliver_by_date"), deadline)
    return kept, used


def _deadline_iso(d: date) -> str:
    return (datetime.combine(d, time(18, 0), tzinfo=UTC) - WAT).isoformat().replace("+00:00", "Z")


def merge(rules: dict, kept: dict, used: dict, mode: str) -> dict:
    """The rules draft, tightened or completed by the grounded model fields. The stricter value wins."""
    L = dict(rules["limits"])
    defaulted = set(rules["defaulted"])
    evidence: dict[str, str] = {}

    def take(field: str, value) -> None:
        key = FIELD_TO_LIMIT[field]
        L[key] = value
        evidence[key] = used[field]
        defaulted.discard(key)

    if "item" in kept:
        take("item", kept["item"])
    for f in ("brand", "model", "category"):  # A constraint beats no constraint.
        if f in kept:
            take(f, kept[f] if f != "model" else str(kept[f]).upper())
    if "quantity" in kept:
        take("quantity", kept["quantity"])
    for f, key in (("max_total_naira", "maxTotalMinor"), ("max_per_item_naira", "maxPerItemMinor"), ("period_cap_naira", "periodCapMinor")):
        if f in kept:
            minor = round(kept[f] * 100)
            current = L.get(key)
            take(f, min(minor, current) if current else minor)  # Lower wins.
    if "seller_rule" in kept:
        stricter = "verified_only" if "verified_only" in (kept["seller_rule"], L["sellerPolicy"]) else kept["seller_rule"]
        take("seller_rule", stricter)
    if "deliver_by_date" in kept:
        model_iso = _deadline_iso(date.fromisoformat(kept["deliver_by_date"]))
        take("deliver_by_date", min(model_iso, L["deliverBy"]) if L.get("deliverBy") else model_iso)  # Earlier wins.
    if "delivery_city" in kept:
        take("delivery_city", kept["delivery_city"].strip().title())
    else:
        defaulted.add("deliveryCity")
    if mode == "not_present" and "period" in kept:
        take("period", kept["period"])

    if L.get("maxPerItemMinor") and L["maxPerItemMinor"] > L.get("maxTotalMinor", 0) > 0:
        L["maxPerItemMinor"] = None
    return {"limits": L, "defaulted": sorted(defaulted), "evidence": evidence}


def compile_draft(viewer: Viewer, request: str, mode: str) -> dict:
    """The shopper's draft, from the live release."""
    draft = compile_with(releases.live(), request, mode, user_id=viewer.user.id)
    draft.pop("model", None)
    return draft


def compile_with(release: releases.Release, request: str, mode: str, *, user_id: str | None, priority: str = "interactive",
                 cacheable: bool = True, now: datetime | None = None) -> dict:
    """
    Sentence → draft with a given release. Evaluations call this with a candidate release,
    a fixed `now`, no cache and their own priority; the result's "model" part says what the
    model proposed and what grounding kept.
    """
    now = now or datetime.now(UTC)
    rules = mandates.draft(request, mode, now=now)
    version = release.prompts.get("intent.compile")
    if not version:
        return {**rules, "evidence": {}}
    today = (now + WAT).date()
    try:
        result = gateway.complete(LlmRequest(
            task="intent.compile", prompt_version=version,
            messages=[
                {"role": "system", "content": releases.prompt("intent.compile", version) + "\n\n" + calendar_text(today)},
                {"role": "user", "content": f"Mode: {'repeat purchases while the shopper is away' if mode == 'not_present' else 'one purchase, shopper approves the cart'}\n\n"
                                            f"<request>{request.strip()[:500]}</request>"},
            ],
            schema=INTENT, schema_name="mandate_draft", models=release.route("intent.compile"), params=release.params.get("intent.compile", {}),
            user_id=user_id, priority=priority, cacheable=cacheable, sandbox_state={"rules": rules, "request": request},
        ))
    except (LlmUnavailable, BudgetExceeded):
        return {**rules, "evidence": {}, "compiledBy": "rules only (the model was unavailable)"}

    kept, used = ground(result.output, request, today)
    merged = merge(rules, kept, used, mode)
    unset = {k for k in merged["defaulted"]}
    questions = {q["field"]: q for q in rules["questions"] if q["field"] in unset}
    for q in result.output.get("questions", []):
        key = FIELD_TO_LIMIT.get(q["field"])
        if key in unset and key not in questions:
            questions[key] = {"field": key, "question": q["question"]}
    if "maxTotalMinor" in unset and "maxTotalMinor" not in questions:
        questions["maxTotalMinor"] = {"field": "maxTotalMinor", "question": "What's the most you want to spend, including delivery? Until you say, nothing can be paid."}
    dropped = sorted({e["field"] for e in result.output.get("evidence", [])} - set(kept))
    return {
        "request": rules["request"], "mode": mode, "limits": merged["limits"], "defaulted": merged["defaulted"],
        "questions": list(questions.values()), "evidence": merged["evidence"],
        "compiledBy": f"{release.id} · intent.compile {version} · {result.model}" + (" (cached)" if result.cached else ""),
        "droppedFields": dropped,
        "model": {"id": result.model, "proposed": sorted({e["field"] for e in result.output.get("evidence", [])}), "kept": sorted(kept),
                  "tokens": result.tokens_in + result.tokens_out, "latencyMs": result.latency_ms, "costMicroUsd": result.cost_micro_usd,
                  "fallback": result.fallback},
    }
