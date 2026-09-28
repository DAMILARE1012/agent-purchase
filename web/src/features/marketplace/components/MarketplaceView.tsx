"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Dialog, EmptyState, ErrorState, Field, Icon, Input, LoadingState, Money, PageHeader, Pagination, SegmentedControl, Select } from "@/components/ui";
import { SellerTierBadge, TIER } from "@/features/sellers";
import { errorMessage } from "@/lib/api-error";
import { type Marketplace, type MarketPhoto, type MarketProduct, useGetMarketplaceQuery } from "../api";
import { categories, deliveredMinor, filterMarket, mandateSentence, type TrustFilter } from "../lib/browse";

const PRODUCTS_PER_PAGE = 12;
const PHOTOS_PER_PAGE = 8;
const OFFERS_ON_CARD = 3;

const TRUST_OPTIONS: Array<{ value: TrustFilter; label: string }> = [
  { value: "any", label: "Any seller" },
  { value: "verified_and_known", label: "Verified and known" },
  { value: "verified", label: "Verified only" },
];

/**
 * Every seller's offers, to compare and to start from. There is deliberately no Buy button:
 * "Ask the AI to buy" starts a mandate, and every purchase still goes through the gate.
 */
export function MarketplaceView({ initialQuery = "" }: { initialQuery?: string }) {
  const { data, error, isLoading } = useGetMarketplaceQuery();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("");
  const [trust, setTrust] = useState<TrustFilter>("any");
  const [productPage, setProductPage] = useState(1);
  const [photoPage, setPhotoPage] = useState(1);
  const [photo, setPhoto] = useState<MarketPhoto | null>(null);
  const [comparing, setComparing] = useState<MarketProduct | null>(null);
  const productsTop = useRef<HTMLElement>(null);
  const photosTop = useRef<HTMLElement>(null);

  const shown = useMemo(() => (data ? filterMarket(data, { query, category, trust }) : null), [data, query, category, trust]);

  /** Any change to what's shown starts again from the first page. */
  function filter(apply: () => void) {
    apply();
    setProductPage(1);
    setPhotoPage(1);
  }

  function goTo(section: "products" | "photos", page: number) {
    (section === "products" ? setProductPage : setPhotoPage)(page);
    (section === "products" ? productsTop : photosTop).current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const productPages = shown ? Math.max(1, Math.ceil(shown.products.length / PRODUCTS_PER_PAGE)) : 1;
  const photoPages = shown ? Math.max(1, Math.ceil(shown.photos.length / PHOTOS_PER_PAGE)) : 1;
  const pPage = Math.min(productPage, productPages);
  const phPage = Math.min(photoPage, photoPages);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marketplace"
        description="What sellers offer right now. Compare, then ask the AI to buy: every purchase still goes through your mandate and the gate."
      />
      {isLoading ? (
        <LoadingState />
      ) : error || !data || !shown ? (
        <ErrorState message={errorMessage(error) ?? "The marketplace isn't available."} />
      ) : (
        <>
          <Card className="grid gap-4 md:grid-cols-[1.4fr_1fr_auto] md:items-end">
            <Field id="market-search" label="Search">
              <Input id="market-search" type="search" value={query} onChange={(e) => filter(() => setQuery(e.target.value))} placeholder="Toner, rice, data, Oraimo…" />
            </Field>
            <Field id="market-category" label="Category">
              <Select id="market-category" value={category} onChange={(e) => filter(() => setCategory(e.target.value))}>
                <option value="">All categories</option>
                {categories(data).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Sellers</span>
              <SegmentedControl label="Sellers" size="md" value={trust} onChange={(v) => filter(() => setTrust(v))} options={TRUST_OPTIONS} />
            </div>
          </Card>

          <Alert tone="ai" title="Seller descriptions and photos are the sellers' own words">
            Some sellers in this sandbox are deliberately dishonest: fake &ldquo;official&rdquo; stores, bargain prices with someone else&apos;s bank
            account. Whatever the AI picks, the gate checks the seller and the account before anything is paid.
          </Alert>

          <section ref={productsTop} className="flex scroll-mt-20 flex-col gap-3">
            <h2 className="font-display text-xl font-semibold">Products <span className="text-base font-normal text-muted">({shown.products.length})</span></h2>
            {shown.products.length === 0 ? (
              <EmptyState title="No listings match">Try another search, or look at the photo catalogs below.</EmptyState>
            ) : (
              <>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {shown.products.slice((pPage - 1) * PRODUCTS_PER_PAGE, pPage * PRODUCTS_PER_PAGE).map((p) => (
                    <li key={p.id}><ProductCard market={data} product={p} onCompare={() => setComparing(p)} /></li>
                  ))}
                </ul>
                <Pagination label="Products" page={pPage} pageCount={productPages} total={shown.products.length} perPage={PRODUCTS_PER_PAGE}
                  onChange={(n) => goTo("products", n)} />
              </>
            )}
          </section>

          <section ref={photosTop} className="flex scroll-mt-20 flex-col gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">Photo catalogs <span className="text-base font-normal text-muted">({shown.photos.length})</span></h2>
              <p className="text-sm text-muted">Some sellers only post a photo of a flyer or price list. The AI reads the photo itself, as you would.</p>
            </div>
            {shown.photos.length === 0 ? (
              <EmptyState title="No photo catalogs match" />
            ) : (
              <>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {shown.photos.slice((phPage - 1) * PHOTOS_PER_PAGE, phPage * PHOTOS_PER_PAGE).map((ph) => (
                    <li key={`${ph.sellerId}-${ph.page}`}><PhotoCard market={data} photo={ph} onOpen={() => setPhoto(ph)} /></li>
                  ))}
                </ul>
                <Pagination label="Photo catalogs" page={phPage} pageCount={photoPages} total={shown.photos.length} perPage={PHOTOS_PER_PAGE}
                  onChange={(n) => goTo("photos", n)} />
              </>
            )}
          </section>
        </>
      )}

      <Dialog open={!!photo} onClose={() => setPhoto(null)} title={photo && data ? data.sellers[photo.sellerId]?.name ?? "" : ""}>
        {photo && (
          <div className="flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the platform API, not a static asset */}
            <img src={`/api/v1/${photo.src}`} alt={`Catalog photo from ${data?.sellers[photo.sellerId]?.name}: ${photo.caption}`} className="w-full rounded-lg border border-line" />
            <p className="text-sm text-muted">The seller says it shows: {photo.caption}</p>
          </div>
        )}
      </Dialog>

      <Dialog open={!!comparing} onClose={() => setComparing(null)} title={comparing ? `${comparing.title} · compare offers` : ""}>
        {comparing && data && <OfferDetails market={data} product={comparing} />}
      </Dialog>
    </div>
  );
}

function deliveryText(market: Marketplace, sellerId: string) {
  const s = market.sellers[sellerId];
  if (s?.deliveryFeeMinor == null) return null;
  const days = s.deliveryDays == null ? "" : s.deliveryDays === 0 ? ", instant" : `, ${s.deliveryDays} ${s.deliveryDays === 1 ? "day" : "days"}`;
  return <>delivery <Money amountMinor={s.deliveryFeeMinor} />{days}</>;
}

/**
 * The offer "Ask the AI to buy" builds the mandate from: the cheapest from the most trusted tier on offer.
 * Never simply the cheapest: that's often the dishonest one, and a budget set to its price would leave
 * nothing an honest seller could sell within it.
 */
function mandateOffer(market: Marketplace, p: MarketProduct) {
  const byPrice = [...p.offers].sort((a, b) => deliveredMinor(market, a) - deliveredMinor(market, b));
  for (const tier of ["verified", "known", "new"] as const) {
    const offer = byPrice.find((o) => market.sellers[o.sellerId]?.tier === tier);
    if (offer) return offer;
  }
  return byPrice[0];
}

function useAskTheAi(market: Marketplace, p: MarketProduct) {
  const router = useRouter();
  const best = mandateOffer(market, p);
  return { best, ask: () => router.push(`/shop/mandates/new?request=${encodeURIComponent(mandateSentence(market, p, best))}`) };
}

/** Compact: the product, what it costs delivered, and its best few offers on one line each. */
function ProductCard({ market, product: p, onCompare }: { market: Marketplace; product: MarketProduct; onCompare: () => void }) {
  const { ask } = useAskTheAi(market, p);
  const cheapest = [...p.offers].sort((a, b) => deliveredMinor(market, a) - deliveredMinor(market, b))[0];
  const hidden = p.offers.length - OFFERS_ON_CARD;

  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold" title={p.title}>{p.title}</h3>
          <p className="text-xs text-muted">{p.category} · {p.offers.length} {p.offers.length === 1 ? "offer" : "offers"}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-muted">from, delivered</p>
          <Money amountMinor={deliveredMinor(market, cheapest)} className="font-display font-semibold" />
        </div>
      </header>
      <ul className="flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
        {p.offers.slice(0, OFFERS_ON_CARD).map((o) => {
          const s = market.sellers[o.sellerId];
          return (
            <li key={o.sku} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate" title={s?.name}>{s?.name}</span>
              {s && <SellerTierBadge tier={s.tier} />}
              <Money amountMinor={o.unitPriceMinor} className="w-20 shrink-0 text-right tabular-nums" />
            </li>
          );
        })}
      </ul>
      <footer className="mt-auto flex items-center justify-between gap-2 pt-1">
        <button type="button" onClick={onCompare} className="text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
          {hidden > 0 ? `Compare all ${p.offers.length}` : "Compare offers"}
        </button>
        <Button size="sm" onClick={ask}><Icon name="spark" className="size-3.5" /> Ask the AI to buy</Button>
      </footer>
    </article>
  );
}

/** Everything about each offer: the seller's own description, delivery, and what a new seller means. */
function OfferDetails({ market, product: p }: { market: Marketplace; product: MarketProduct }) {
  const { ask } = useAskTheAi(market, p);
  const bestVerified = p.offers.find((o) => market.sellers[o.sellerId]?.tier === "verified");
  return (
    <div className="flex flex-col gap-4">
      <ul className="max-h-[55vh] divide-y divide-line overflow-y-auto border-y border-line">
        {p.offers.map((o) => {
          const s = market.sellers[o.sellerId];
          return (
            <li key={o.sku} className="flex flex-col gap-1 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {s?.name} {s && <SellerTierBadge tier={s.tier} />}
                  {o === bestVerified && p.offers.length > 1 && <Badge tone="truth">Lowest verified price</Badge>}
                </p>
                <Money amountMinor={o.unitPriceMinor} className="shrink-0 font-semibold" />
              </div>
              <p className="text-ink-2">{o.name}{o.packSize > 1 ? ` · pack of ${o.packSize}` : ""}{!o.inStock ? " · out of stock" : ""}</p>
              <p className="text-xs text-muted">{s?.city}{deliveryText(market, o.sellerId) && <> · {deliveryText(market, o.sellerId)}</>}</p>
              {o.description && <p className="text-ink-2 italic">&ldquo;{o.description}&rdquo;</p>}
              {s?.tier === "new" && <p className="text-xs text-ai">{TIER.new.meaning}.</p>}
            </li>
          );
        })}
      </ul>
      {p.inPhotos.length > 0 && (
        <p className="text-sm text-ink-2">
          Also in photo catalogs from {p.inPhotos.map((id) => market.sellers[id]?.name ?? id).join(", ")}: the AI reads those photos to compare.
        </p>
      )}
      <Button className="self-end" onClick={ask}><Icon name="spark" className="size-4" /> Ask the AI to buy this</Button>
    </div>
  );
}

function PhotoCard({ market, photo, onOpen }: { market: Marketplace; photo: MarketPhoto; onOpen: () => void }) {
  const s = market.sellers[photo.sellerId];
  return (
    <article className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-3">
      <button type="button" onClick={onOpen} className="overflow-hidden rounded-lg border border-line bg-surface-2" aria-label={`Open the photo catalog from ${s?.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- served by the platform API, not a static asset */}
        <img src={`/api/v1/${photo.src}`} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover object-top transition-transform hover:scale-[1.02]" />
      </button>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={s?.name}>{s?.name}</span>
        {s && <SellerTierBadge tier={s.tier} />}
      </div>
      <p className="line-clamp-2 text-xs text-ink-2" title={photo.caption}>Seller says: {photo.caption}</p>
    </article>
  );
}
