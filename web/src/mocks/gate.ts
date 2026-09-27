// A TypeScript mirror of the gate rules (system_design.md §3) so mocked runs get
// realistic decisions. The real gate is server-side code built in M7; this one
// only feeds the UI and must never be treated as a security control.

import type { Cart, GateCheck, GateDecision, Mandate, Seller } from "@/types/domain";
import { formatMoney } from "@/lib/money";
import { catalog, GATE_VERSION } from "./data";

const HOUR = 3_600_000;

interface Context {
  /** Decision time; defaults to now. Seeded history passes the run's time. */
  at?: string;
  /** Spent under this mandate in the current period (standing mandates). */
  periodSpentMinor?: number;
}

const normalizeName = (name: string) =>
  name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\bLIMITED\b/g, "LTD").replace(/\s+/g, " ").trim();

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function decide(mandate: Mandate, cart: Cart, sellers: Seller[], ctx: Context = {}): GateDecision {
  const at = ctx.at ? Date.parse(ctx.at) : Date.now();
  const L = mandate.limits;
  const seller = sellers.find((s) => s.id === cart.sellerId);
  const checks: GateCheck[] = [];
  const add = (rule: GateCheck["rule"], label: string, ok: boolean, pass: string, fail: string, soft = false) =>
    checks.push({ rule, label, result: ok ? "pass" : soft ? "warn" : "fail", detail: ok ? pass : fail });

  // 1. Mandate
  const mandateProblem =
    mandate.status === "revoked" ? "The mandate was cancelled"
    : Date.parse(L.expiresAt) <= at ? "The mandate has expired"
    : mandate.uses >= L.maxUses ? "The mandate has no uses left"
    : null;
  add("mandate_valid", "Mandate is signed and still valid", !mandateProblem, "Signed, not expired, uses left", mandateProblem ?? "");

  // 2. Cart signature
  add("cart_signed", "Cart is signed by the seller", cart.sellerSignatureValid && Date.parse(cart.expiresAt) > at,
    "Seller's signature verified; cart not expired", cart.sellerSignatureValid ? "The cart has expired" : "The seller's signature doesn't verify");

  // 3. Seller allowed
  const allowed = !!seller && seller.tier !== "suspended" && (
    L.sellerPolicy === "verified_only" ? seller.tier === "verified"
    : L.sellerPolicy === "verified_and_known" ? seller.tier === "verified" || seller.tier === "known"
    : L.sellerIds.includes(seller.id));
  const policyText = { verified_only: "verified sellers only", verified_and_known: "verified and known sellers", listed: "the sellers you listed" }[L.sellerPolicy];
  add("seller_allowed", "Seller is allowed by the mandate", allowed,
    `${cart.sellerName} is ${seller?.tier ?? "unknown"}; the mandate allows ${policyText}`,
    `${cart.sellerName} is ${seller?.tier ?? "unknown"}; the mandate allows ${policyText}`);

  // 4. Arithmetic
  const linesOk = cart.lines.every((l) => l.lineTotalMinor === l.unitPriceMinor * l.quantity);
  const sum = cart.lines.reduce((n, l) => n + l.lineTotalMinor, 0) + cart.deliveryFeeMinor;
  add("arithmetic", "Prices add up", linesOk && sum === cart.totalMinor,
    `Lines + delivery = ${formatMoney(cart.totalMinor)}`, `Lines + delivery = ${formatMoney(sum)}, but the cart says ${formatMoney(cart.totalMinor)}`);

  // 5. Limits
  const overItem = L.maxPerItemMinor !== null ? cart.lines.find((l) => l.lineTotalMinor > L.maxPerItemMinor!) : undefined;
  add("within_limits", "Within your spending limits", cart.totalMinor <= L.maxTotalMinor && !overItem,
    `${formatMoney(cart.totalMinor)} of ${formatMoney(L.maxTotalMinor)} allowed`,
    overItem ? `${overItem.name} costs more than the ${formatMoney(L.maxPerItemMinor!)} per-item limit`
      : `${formatMoney(cart.totalMinor)} is over the ${formatMoney(L.maxTotalMinor)} limit`);

  // 6. Item attributes (as signed by the seller)
  const same = (a: string | null, b: string | null) => (a ?? "").toUpperCase() === (b ?? "").toUpperCase();
  const wrong = cart.lines.find((l) => (L.brand && !same(l.brand, L.brand)) || (L.model && !same(l.model, L.model)));
  const qty = cart.lines.reduce((n, l) => n + l.quantity * l.packSize, 0);
  const itemOk = !wrong && (L.quantity <= 1 || qty >= L.quantity);
  add("item_matches", "It's the item you asked for", itemOk,
    L.model ? `${L.brand ?? ""} ${L.model}, as signed by the seller`.trim() : "Items match the mandate",
    wrong ? `The cart has “${wrong.name}” (${wrong.brand ?? "no brand"} ${wrong.model ?? ""}), not ${L.brand ?? ""} ${L.model ?? ""}`.replace(/\s+/g, " ")
      : `The cart has ${qty}, you asked for ${L.quantity}`);

  // 7. Delivery
  const deliveryOk = !L.deliverBy || Date.parse(cart.deliveryBy) <= Date.parse(L.deliverBy);
  add("delivery_date", "Arrives before your deadline", deliveryOk,
    L.deliverBy ? "Delivery date is before the deadline" : "No deadline set", "Delivery would be after your deadline");

  // 8. Payee
  const registered = seller?.accounts.find((a) => a.accountNumberMasked === cart.payee.accountNumberMasked && a.bankCode === cart.payee.bankCode);
  const nameMatches = !!seller && normalizeName(cart.payee.nameOnAccount) === normalizeName(seller.legalName);
  const payeeOk = !!registered?.verifiedAt && nameMatches;
  add("payee_verified", "Money goes to the seller's own account", payeeOk,
    `Bank says ${cart.payee.bankName} ${cart.payee.accountNumberMasked} is “${cart.payee.nameOnAccount}”, matching ${seller?.legalName}`,
    !nameMatches
      ? `Bank says ${cart.payee.bankName} ${cart.payee.accountNumberMasked} belongs to “${cart.payee.nameOnAccount}”, not ${seller?.legalName ?? "the seller"}`
      : "This account hasn't been verified for the seller");

  // 9. Period cap (standing mandates)
  if (L.periodCapMinor !== null && L.period) {
    const spent = ctx.periodSpentMinor ?? 0;
    add("period_cap", `Within the ${L.period}ly cap`, spent + cart.totalMinor <= L.periodCapMinor,
      `${formatMoney(spent + cart.totalMinor)} of ${formatMoney(L.periodCapMinor)} this ${L.period}`,
      `This would make ${formatMoney(spent + cart.totalMinor)}, over the ${formatMoney(L.periodCapMinor)} ${L.period}ly cap`);
  }

  // Soft rules: ask the shopper even when every hard rule passes.
  add("soft_new_seller", "Seller has a track record", seller?.tier !== "new", "Established seller", `${cart.sellerName} joined recently`, true);
  const outlier = cart.lines.find((l) => {
    const peers = catalog.filter((c) => c.brand === l.brand && c.model === l.model && c.packSize === l.packSize).map((c) => c.unitPriceMinor);
    return peers.length >= 3 && l.unitPriceMinor > 1.5 * median(peers);
  });
  add("soft_price_outlier", "Price is in line with other sellers", !outlier, "Price is close to other sellers'", `${outlier?.name} is well above other sellers' prices`, true);
  if (L.deliverBy) {
    const tight = Date.parse(L.deliverBy) - Date.parse(cart.deliveryBy) < 6 * HOUR;
    add("soft_tight_delivery", "Delivery has some slack", !tight, "Arrives with time to spare", "Arrives within 6 hours of your deadline", true);
  }

  const outcome = checks.some((c) => c.result === "fail") ? "deny" : checks.some((c) => c.result === "warn") ? "needs_approval" : "allow";
  return { outcome, gateVersion: GATE_VERSION, checks, decidedAt: new Date(at).toISOString() };
}
