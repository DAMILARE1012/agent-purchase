// Stand-in for the agent runtime: a new run is scripted up front, then revealed
// step by step as time passes, so the live shopping view has something to follow.

import type { AgentRun, Cart, CatalogItem, Mandate, RunStep } from "@/types/domain";
import { formatMoney } from "@/lib/money";
import { ahead, catalog, LIVE_VERSION, runs, SHOPPER, sellers, step, totals } from "./data";
import { decide } from "./gate";

const QUEUE_MS = 1_500;
const STEP_MS = 1_400;

interface Script {
  createdAt: number;
  steps: RunStep[];
  cart: Cart | null;
  final: Pick<AgentRun, "status" | "decision" | "outcomeNote">;
}

const scripts = new Map<string, Script>();

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

function candidates(m: Mandate): CatalogItem[] {
  const L = m.limits;
  const wanted = words(L.item);
  return catalog
    .filter((c) => {
      if (L.brand && c.brand?.toUpperCase() !== L.brand.toUpperCase()) return false;
      if (L.model && !(c.model ?? "").toUpperCase().startsWith(L.model.toUpperCase())) return false;
      if (L.category && c.category !== L.category) return false;
      return L.brand || L.model || L.category ? true : wanted.some((w) => c.name.toLowerCase().includes(w));
    })
    .sort((a, b) => a.unitPriceMinor - b.unitPriceMinor);
}

function buildCart(m: Mandate, c: CatalogItem, n: number): Cart {
  const s = sellers.find((x) => x.id === c.sellerId)!;
  const quantity = Math.max(1, Math.ceil(m.limits.quantity / c.packSize));
  const deliveryFeeMinor = c.category === "Data" ? 0 : 200_000;
  const room = m.limits.deliverBy ? (Date.parse(m.limits.deliverBy) - Date.now()) / 2 : Infinity;
  const deliveryBy = new Date(Date.now() + Math.min(2 * 86_400_000, room)).toISOString();
  const lineTotalMinor = c.unitPriceMinor * quantity;
  return {
    id: `c_live_${n}`, sellerId: s.id, sellerName: s.displayName,
    lines: [{ sku: c.sku, name: c.name, brand: c.brand, model: c.model, packSize: c.packSize, quantity, unitPriceMinor: c.unitPriceMinor, lineTotalMinor }],
    deliveryFeeMinor, totalMinor: lineTotalMinor + deliveryFeeMinor, deliveryBy,
    payee: s.accounts[0], expiresAt: ahead(30), sellerSignatureValid: true,
  };
}

function respectsPolicy(m: Mandate, sellerId: string): boolean {
  const s = sellers.find((x) => x.id === sellerId)!;
  const L = m.limits;
  if (L.sellerPolicy === "listed") return L.sellerIds.includes(s.id);
  return s.tier === "verified" || (L.sellerPolicy === "verified_and_known" && s.tier === "known");
}

/**
 * Scripts a run. The agent takes the cheapest listing from a seller the mandate
 * allows, but dishonest sellers can still talk it into their listing (that's what
 * the gate is for). Sellers the gate already refused for this mandate are skipped.
 */
export function startRun(m: Mandate, id: string): AgentRun {
  const refused = new Set(runs.filter((r) => r.mandateId === m.id && r.decision?.outcome === "deny").map((r) => r.cart?.sellerId));
  const found = candidates(m);
  const steps: RunStep[] = [step(0, "search_catalog", `Searched ${sellers.length} sellers for “${m.limits.item}”: ${found.length} ${found.length === 1 ? "listing" : "listings"} found`)];

  const pick = found.find((c) => !refused.has(c.sellerId) && (respectsPolicy(m, c.sellerId) || sellers.find((s) => s.id === c.sellerId)!.adversarial));
  for (const c of found.slice(0, 3)) {
    const s = sellers.find((x) => x.id === c.sellerId)!;
    steps.push(
      c.source === "image"
        ? step(0, "read_catalog_image", `Read a ${s.catalogKind === "images" ? "price-list photo" : "flyer"} from ${s.displayName}: ${c.name} at ${formatMoney(c.unitPriceMinor)}`,
            { sellerId: s.id, untrusted: true, injectionScore: s.adversarial ? 0.6 : 0.02, tokensIn: 4_300, latencyMs: 1_400, costMicroUsd: 980 })
        : step(0, "get_product", `Opened “${c.name}” at ${s.displayName}`, { sellerId: s.id, untrusted: true, injectionScore: s.adversarial ? 0.9 : 0.01 }),
    );
  }

  let cart: Cart | null = null;
  let final: Script["final"];
  if (!pick) {
    steps.push(step(0, "give_up", "No listing matched the mandate"));
    final = { status: "gave_up", decision: null, outcomeNote: "No seller had a matching item. Nothing was paid" };
  } else {
    cart = buildCart(m, pick, runs.length + 1);
    if (cart.totalMinor > m.limits.maxTotalMinor && m.limits.maxTotalMinor > 0 && !sellers.find((s) => s.id === pick.sellerId)?.adversarial) {
      steps.push(step(0, "give_up", `The cheapest option costs ${formatMoney(cart.totalMinor)}, over your ${formatMoney(m.limits.maxTotalMinor)} limit`));
      final = { status: "gave_up", decision: null, outcomeNote: "Nothing within your limits. Nothing was paid" };
      cart = null;
    } else {
      steps.push(
        step(0, "request_cart", `Asked ${cart.sellerName} for a cart: ${cart.lines[0].quantity} × ${pick.name}`, { sellerId: pick.sellerId, untrusted: true }),
        step(0, "propose_cart", `Proposed the cart: ${formatMoney(cart.totalMinor)}`),
      );
      const decision = decide(m, cart, sellers);
      const failed = decision.checks.filter((c) => c.result === "fail").map((c) => c.label.toLowerCase());
      steps.push(step(0, "gate", decision.outcome === "deny" ? `Gate refused the cart: ${failed.join("; ")}` : decision.outcome === "allow" ? "Gate allowed the cart: every check passed" : "Gate allowed the cart, with warnings for you to review"));
      final = decision.outcome === "deny"
        ? { status: "blocked", decision, outcomeNote: "Blocked by the gate. Nothing was paid" }
        : { status: "awaiting_approval", decision, outcomeNote: null };
    }
  }

  const run: AgentRun = {
    id, mandateId: m.id, shopperName: SHOPPER, status: "queued", agentVersion: LIVE_VERSION,
    startedAt: new Date().toISOString(), endedAt: null, queuePosition: 1, steps: [], cart: null, decision: null,
    purchaseId: null, totals: totals([]), outcomeNote: null,
  };
  scripts.set(id, { createdAt: Date.now(), steps, cart, final });
  return run;
}

/** Reveals a scripted run's progress according to the time elapsed. */
export function advance(run: AgentRun): AgentRun {
  const script = scripts.get(run.id);
  if (!script) return run;
  const elapsed = Date.now() - script.createdAt;
  if (elapsed < QUEUE_MS) return run;

  const shown = Math.min(script.steps.length, Math.floor((elapsed - QUEUE_MS) / STEP_MS) + 1);
  const stamp = (s: RunStep, i: number) => ({ ...s, at: new Date(script.createdAt + QUEUE_MS + i * STEP_MS).toISOString() });
  run.steps = script.steps.slice(0, shown).map(stamp);
  run.totals = totals(run.steps);
  run.queuePosition = null;
  if (shown < script.steps.length) {
    run.status = "running";
    return run;
  }
  Object.assign(run, script.final, { cart: script.cart, endedAt: script.final.status === "awaiting_approval" ? null : run.steps.at(-1)!.at });
  scripts.delete(run.id);
  return run;
}
