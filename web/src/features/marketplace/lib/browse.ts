import type { SellerTier } from "@/types/domain";
import type { Marketplace, MarketOffer, MarketPhoto, MarketProduct } from "../api";

export type TrustFilter = "any" | "verified_and_known" | "verified";

const ALLOWED: Record<TrustFilter, SellerTier[]> = {
  any: ["verified", "known", "new"],
  verified_and_known: ["verified", "known"],
  verified: ["verified"],
};

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9₦]+/g) ?? [];
}

/** Every word of the query appears somewhere in the text (so "hp toner" finds "HP 107A · Printer toner"). */
function matches(query: string, ...texts: Array<string | null | undefined>): boolean {
  const wanted = words(query);
  if (wanted.length === 0) return true;
  const hay = words(texts.filter(Boolean).join(" "));
  return wanted.every((w) => hay.some((h) => h.startsWith(w)));
}

export interface Filters {
  query: string;
  category: string;
  trust: TrustFilter;
}

/** Products with only the offers that pass the filters, and the photo catalogs that do. */
export function filterMarket(m: Marketplace, f: Filters): { products: MarketProduct[]; photos: MarketPhoto[] } {
  const tierOk = (sellerId: string) => ALLOWED[f.trust].includes(m.sellers[sellerId]?.tier);
  const products = m.products
    .filter((p) => !f.category || p.category === f.category)
    .map((p) => {
      const productMatch = matches(f.query, p.title, p.brand, p.model, p.category);
      const offers = p.offers.filter((o) => tierOk(o.sellerId) && (productMatch || matches(f.query, o.name, m.sellers[o.sellerId]?.name)));
      return { ...p, offers };
    })
    .filter((p) => p.offers.length > 0);
  const photos = m.photos.filter((ph) => tierOk(ph.sellerId) && (!f.category || ph.topics.includes(f.category))
    && matches(f.query, ph.caption, ph.topics.join(" "), m.sellers[ph.sellerId]?.name));
  return { products, photos };
}

export function categories(m: Marketplace): string[] {
  return [...new Set(m.products.map((p) => p.category))].sort();
}

/** What an offer costs delivered: enough packs for one unit, plus the seller's published delivery fee. */
export function deliveredMinor(m: Marketplace, o: MarketOffer): number {
  return o.unitPriceMinor + (m.sellers[o.sellerId]?.deliveryFeeMinor ?? 0);
}

/**
 * The sentence for "Ask the AI to buy this": the product, a budget just above this offer's
 * delivered price, and the widest seller rule this offer needs. The shopper can change all of it.
 */
export function mandateSentence(m: Marketplace, p: MarketProduct, o: MarketOffer): string {
  const what = p.brand && p.model ? `${p.brand} ${p.model} ${p.category.toLowerCase()}` : o.name;
  const budget = Math.ceil(deliveredMinor(m, o) / 100 / 1000) * 1000;
  const tier = m.sellers[o.sellerId]?.tier;
  const sellers = tier === "verified" ? ", from a verified seller" : tier === "known" ? ", from a verified or known seller" : "";
  return `${what}, under ₦${budget.toLocaleString("en-NG")}${sellers}`;
}
