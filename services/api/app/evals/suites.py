"""
Running each suite against a release. These call the model (through the gateway, uncached,
at evaluation priority, on the evaluation budget), the sandbox marketplace and the switch.
"""

import hashlib
import json
import math
import re
import secrets
import subprocess
import sys
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agent import runtime, tools
from app.agent.releases import Release
from app.db import SessionLocal
from app.evals import metrics, report
from app.formatting import now
from app.llm.gateway import BudgetExceeded, LlmUnavailable
from app.models import AgentRun, InferenceLog, Mandate, Merchant, RunStep, User
from app.services import gate, intent, mandates, marketplace
from app.services.runs import EVAL_USER_ID

WAT = timedelta(hours=1)
Log = Callable[[str], None]


def ensure_eval_user(db: Session) -> None:
    """Evaluation runs belong to a system user, so they never mix with shoppers' data."""
    if db.get(User, EVAL_USER_ID) is None:
        db.add(User(id=EVAL_USER_ID, username=EVAL_USER_ID, display_name="Evaluation runner", email=None, role="ops"))
        db.commit()


# ---- Mandate drafting ------------------------------------------------------------------------------------------------


def run_intent(release: Release, log: Log, limit: int | None = None) -> tuple[list[dict], list[dict]]:
    data = report.load_dataset("intent_fidelity")
    at = datetime.fromisoformat(data["now"].replace("Z", "+00:00"))
    results = []
    for case in data["cases"][:limit]:
        draft = intent.compile_with(release, case["request"], case["mode"], user_id=EVAL_USER_ID, priority="eval", cacheable=False, now=at)
        r = metrics.score_intent(case, draft)
        results.append(r)
        log(
            f"  {case['id']}: {'BROADER ' + ','.join(r['broader']) if r['broader'] else 'ok'}; "
            f"{sum(r['fields'].values())}/{len(r['fields'])} fields; dropped {r['dropped']}/{r['proposed']}"
        )
    return results, metrics.intent_metrics(results)


# ---- Catalog reading --------------------------------------------------------------------------------------------------


def snapshot_catalog() -> dict:
    """Freezes the marketplace's catalog-image labels (and each image's hash) into the test set."""
    images = []
    for page in tools.catalog_labels():
        data_url = tools.image_data_url(page["url"])
        images.append({**page, "sha256": hashlib.sha256(data_url.encode()).hexdigest()})
    return {
        "about": "Every photo catalog in the sandbox marketplace, with exactly what it shows. "
        "Regenerate with: python -m app.evals snapshot-catalog",
        "images": images,
    }


def run_catalog(release: Release, log: Log, limit: int | None = None) -> tuple[list[dict], list[dict]]:
    images = report.load_dataset("catalog_reading")["images"][:limit]
    results = []
    for image in images:
        if hashlib.sha256(tools.image_data_url(image["url"]).encode()).hexdigest() != image["sha256"]:
            raise RuntimeError(f"The image {image['url']} changed since the test set was made. Run: python -m app.evals snapshot-catalog")
        try:
            res = runtime.read_catalog_image(
                release, image["url"], user_id=EVAL_USER_ID, run_id=None, priority="eval", deadline=time.monotonic() + 600, cacheable=False
            )
            r = metrics.score_catalog(
                image, res.output, latency_ms=res.latency_ms, tokens=res.tokens_in + res.tokens_out, cost_micro_usd=res.cost_micro_usd
            )
        except (LlmUnavailable, BudgetExceeded) as exc:
            r = metrics.score_catalog(image, None, error=str(exc)[:300])
        results.append(r)
        log(
            f"  {r['id']}: found {r['found']}/{r['labels']}, prices {r['priceOk']}, invented {r['invented']}"
            + (f", hidden text {'reported' if r['hiddenReported'] else 'MISSED'}" if r["hiddenExpected"] else "")
            + (f" ERROR {r['error']}" if r["error"] else "")
        )
    return results, metrics.catalog_metrics(results)


# ---- Shopping tasks ----------------------------------------------------------------------------------------------------


def _resolve(limits: dict, at: datetime) -> dict:
    """Relative dates ("+5d") to 18:00 in Lagos that day; everything a mandate needs that the task doesn't say."""

    def when(v):
        if not (isinstance(v, str) and (m := re.fullmatch(r"\+(\d+)d", v))):
            return v
        day = (at + WAT + timedelta(days=int(m.group(1)))).replace(hour=18, minute=0, second=0, microsecond=0) - WAT
        return day.isoformat().replace("+00:00", "Z")

    full = {
        "maxPerItemMinor": None,
        "sellerIds": [],
        "expiresAt": "+2d",
        "maxUses": 1,
        "periodCapMinor": None,
        "period": None,
        "shareDelivery": {"name": True, "phone": True, "address": True},
        **limits,
    }
    return {k: when(v) for k, v in full.items()}


def best_cart(db: Session, task: dict, limits: dict) -> tuple[dict | None, list[dict]]:
    """
    The known best cart: every seller is asked for a signed cart of the acceptable items it sells,
    each cart goes through the gate, and the cheapest allowed one wins. No model involved.
    """
    oracle = Mandate(id="m_oracle", status="active", mode="present", limits=limits, uses=0)
    options = []
    for merchant in db.scalars(select(Merchant).order_by(Merchant.id)):
        items = {i["sku"]: i for i in marketplace.seller_items(merchant.id)}
        lines = []
        for line in task["lines"]:
            offered = [items[s] for s in line["accept"] if s in items]
            if not offered:
                break
            pick = min(offered, key=lambda i: i["unitPriceMinor"] * math.ceil(line["units"] / max(1, i["packSize"])))
            lines.append({"sku": pick["sku"], "quantity": math.ceil(line["units"] / max(1, pick["packSize"]))})
        else:
            signed = tools.create_cart(merchant.id, lines, limits["deliveryCity"])
            verdict = gate.decide(db, oracle, signed)
            options.append(
                {
                    "sellerId": merchant.id,
                    "totalMinor": signed["cart"]["totalMinor"],
                    "allowed": verdict["outcome"] != "deny",
                    "failed": [c["rule"] for c in verdict["checks"] if c["result"] == "fail"],
                }
            )
    allowed = [o for o in options if o["allowed"]]
    return (min(allowed, key=lambda o: o["totalMinor"]) if allowed else None), options


def _run_task(db: Session, release: Release, task: dict, limits: dict) -> dict:
    """One task, end to end through the real agent loop, up to the gate's decision. Nothing is paid."""
    m = Mandate(
        id="m_" + secrets.token_hex(8),
        user_id=EVAL_USER_ID,
        status="active",
        mode="present",
        request=task["request"],
        limits=limits,
        mandate_hash=mandates.canonical_hash("present", limits),
        signature_kind="test",
        assertion=json.dumps({"kind": "test", "note": "Evaluation mandate; never paid."}),
        compiled_by=None,
        uses=0,
        spent_minor=0,
        signed_at=now(),
    )
    db.add(m)
    db.flush()  # The run refers to the mandate; no ORM relationship orders the inserts.
    run = AgentRun(
        id="r_" + secrets.token_hex(8),
        mandate_id=m.id,
        user_id=EVAL_USER_ID,
        release_id=release.id,
        status="queued",
        priority="eval",
        tokens=0,
        cost_micro_usd=0,
        latency_ms=0,
    )
    db.add(run)
    db.commit()
    runtime.execute(run.id, cacheable=False, timeout_s=1800)

    db.expire_all()
    run = db.get(AgentRun, run.id)
    cart = (run.signed_cart or {}).get("cart") or {}
    items = {i["sku"]: i for i in marketplace.seller_items(cart["sellerId"])} if cart else {}
    model_ms = db.scalar(select(func.coalesce(func.sum(InferenceLog.latency_ms), 0)).where(InferenceLog.run_id == run.id)) or 0
    steps = db.scalar(select(func.count()).select_from(RunStep).where(RunStep.run_id == run.id, RunStep.model.is_not(None))) or 0
    outcome = {
        "runId": run.id,
        "status": run.status,
        "sellerId": cart.get("sellerId"),
        "totalMinor": cart.get("totalMinor"),
        "lines": [
            {
                "sku": ln.get("sku"),
                "quantity": ln["quantity"],
                "packSize": ln.get("packSize") or items.get(ln.get("sku"), {}).get("packSize", 1),
            }
            for ln in cart.get("lines", [])
        ],
        "refusedRules": [c["rule"] for c in (run.decision or {}).get("checks", []) if c["result"] == "fail"],
        "steps": steps,
        "modelMs": int(model_ms),
        "tokens": run.tokens,
        "costMicroUsd": run.cost_micro_usd,
        "wallMs": int(((run.ended_at or now()) - (run.began_at or run.created_at)).total_seconds() * 1000),
        "note": run.outcome_note,
    }
    # Tidy up: the evaluation mandate is cancelled, so its cart can never be approved.
    m = db.get(Mandate, m.id)
    m.status, m.revoked_at = "revoked", now()
    if run.status == "awaiting_approval":
        run.status, run.ended_at = "declined", now()
    db.commit()
    return outcome


def run_shopping(release: Release, log: Log, limit: int | None = None) -> tuple[list[dict], list[dict]]:
    tasks = report.load_dataset("shopping_tasks")["tasks"][:limit]
    results = []
    with SessionLocal() as db:
        ensure_eval_user(db)
        for task in tasks:
            limits = _resolve(task["limits"], datetime.now(UTC))
            best, options = best_cart(db, task, limits)
            outcome = _run_task(db, release, task, limits)
            r = {**metrics.score_shopping(task, outcome, best), "options": options}
            results.append(r)
            verdict = "SUCCESS" if r["success"] else "REFUSED" if r["refused"] else "WRONG ITEM" if r["wrongItem"] else "NO CART"
            log(
                f"  {task['id']}: {verdict} {r['sellerId'] or ''} {r['totalMinor'] or ''} "
                f"(best {r['bestSellerId']} {r['bestTotalMinor']}); "
                f"{r['steps']} steps, {r['tokens']} tokens, {r['modelMs'] / 1000:.0f}s model, {r['wallMs'] / 1000:.0f}s wall"
            )
    return results, metrics.shopping_metrics(results)


# ---- Gate properties -----------------------------------------------------------------------------------------------------


def run_gate_properties(_release: Release, log: Log, limit: int | None = None) -> tuple[list[dict], list[dict]]:
    """The generated gate tests; they don't depend on the release, so their result is reused across releases."""
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests/test_gate_properties.py"],
        capture_output=True,
        text=True,
        cwd=str(report.EVALS_DIR.parent),
    )
    passed = int(m.group(1)) if (m := re.search(r"(\d+) passed", proc.stdout)) else 0
    failed = int(m.group(1)) if (m := re.search(r"(\d+) failed", proc.stdout)) else 0
    examples = 1700  # The max_examples of the four property tests.
    log(f"  {passed} passed, {failed} failed")
    results = [{"id": "hypothesis", "passed": passed, "failed": failed, "output": proc.stdout[-2000:]}]
    return results, [metrics.metric("Rule-breaking carts refused", metrics.pct(passed, passed + failed), "%", "higher", 100, examples)]


RUNNERS = {
    "intent_fidelity": run_intent,
    "catalog_reading": run_catalog,
    "shopping_tasks": run_shopping,
    "gate_properties": run_gate_properties,
}
