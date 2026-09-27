"use client";

import Link from "next/link";
import { ButtonLink, Card, EmptyState, ErrorState, Icon, type IconName, LoadingState, Money, PageHeader, Spinner, StatTile } from "@/components/ui";
import { MandateCard, useGetMandatesQuery } from "@/features/mandates";
import { useGetPurchasesQuery } from "@/features/purchases";
import { isActiveRun, useGetRunsQuery } from "@/features/runs";
import { useViewer } from "@/features/session";
import { errorMessage } from "@/lib/api-error";
import { cn } from "@/lib/cn";
import { formatRelative, greeting } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { useNow } from "@/lib/useNow";

const DAY = 86_400_000;

interface Activity {
  id: string;
  at: string;
  href: string;
  icon: IconName;
  tone: string;
  text: string;
  amountMinor: number | null;
}

/** The shopper's home: what needs them, what's active, and what happened. */
export function ShopperHome() {
  const { user } = useViewer();
  const now = useNow();
  const mandates = useGetMandatesQuery();
  const runs = useGetRunsQuery(undefined, { pollingInterval: 3_000, skipPollingIfUnfocused: true });
  const purchases = useGetPurchasesQuery();

  if (mandates.isLoading || runs.isLoading || purchases.isLoading) return <LoadingState />;
  const error = mandates.error ?? runs.error ?? purchases.error;
  if (error) return <ErrorState message={errorMessage(error) ?? ""} />;

  const allMandates = mandates.data ?? [];
  const allRuns = runs.data ?? [];
  const allPurchases = purchases.data ?? [];
  const itemOf = (mandateId: string) => allMandates.find((m) => m.id === mandateId)?.limits.item ?? "Purchase";

  const active = allMandates.filter((m) => m.status === "active");
  const waiting = allRuns.filter((r) => r.status === "awaiting_approval");
  const working = allRuns.filter(isActiveRun);
  const blocked = allRuns.filter((r) => r.status === "blocked");
  const spent30 = allPurchases.filter((p) => now - Date.parse(p.paidAt) <= 30 * DAY).reduce((n, p) => n + p.totalMinor, 0);
  const stopped = blocked.reduce((n, r) => n + (r.cart?.totalMinor ?? 0), 0);

  const activity: Activity[] = [
    ...allPurchases.map((p) => ({
      id: p.id, at: p.paidAt, href: `/shop/purchases/${p.id}`, icon: "cart" as const, tone: "bg-truth-bg text-truth",
      text: `Bought ${p.summary} from ${p.sellerName}`, amountMinor: p.totalMinor,
    })),
    ...allRuns.filter((r) => ["blocked", "gave_up", "declined"].includes(r.status)).map((r) => ({
      id: r.id, at: r.endedAt ?? r.startedAt, href: `/shop/runs/${r.id}`,
      icon: (r.status === "blocked" ? "shield" : "close") as IconName,
      tone: r.status === "blocked" ? "bg-bad-bg text-bad" : "bg-surface-2 text-muted",
      text: r.status === "blocked"
        ? `Gate blocked a cart from ${r.cart?.sellerName ?? "a seller"} for ${itemOf(r.mandateId)}`
        : `${itemOf(r.mandateId)}: ${r.outcomeNote ?? "no purchase"}`,
      amountMinor: r.status === "blocked" ? r.cart?.totalMinor ?? null : null,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 7);

  const firstName = user?.displayName.split(" ")[0] ?? "";

  if (allMandates.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`${greeting(new Date(now))}${firstName ? `, ${firstName}` : ""}`} />
        <Card className="flex flex-col items-start gap-4 p-8">
          <span className="grid size-12 place-items-center rounded-xl bg-crypto-bg text-crypto"><Icon name="mandate" className="size-6" /></span>
          <h2 className="font-display text-2xl font-bold">Tell the AI what to buy, and set its limits</h2>
          <p className="max-w-xl text-ink-2">Write what you need in a sentence. You&apos;ll check the exact limits and sign them with your passkey. The AI can&apos;t spend outside them.</p>
          <ButtonLink href="/shop/mandates/new"><Icon name="mandate" className="size-4" /> Create your first mandate</ButtonLink>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`${greeting(new Date(now))}${firstName ? `, ${firstName}` : ""}`}
        description="Your AI shopper can only spend within the limits you've signed."
      />

      {(waiting.length > 0 || working.length > 0) && (
        <section aria-labelledby="needs-you" className="flex flex-col gap-3">
          <h2 id="needs-you" className="font-display text-xl font-semibold">Needs you</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {waiting.map((r) => (
              <Card key={r.id} className="flex flex-col gap-3 border-crypto">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm text-muted">{itemOf(r.mandateId)}</span>
                    <span className="font-display text-lg font-semibold">Cart from {r.cart?.sellerName}</span>
                  </div>
                  {r.cart && <Money amountMinor={r.cart.totalMinor} className="font-display text-2xl font-bold" />}
                </div>
                <p className="flex items-center gap-2 text-sm text-ink-2">
                  <Icon name="shield" className="size-4 text-truth" />
                  {r.decision?.outcome === "needs_approval" ? "Gate allowed it, with warnings to check" : "Gate allowed it: every check passed"}
                </p>
                <ButtonLink href={`/shop/runs/${r.id}`} className="self-start">Review and pay</ButtonLink>
              </Card>
            ))}
            {working.map((r) => (
              <Card key={r.id} className="flex items-center gap-4">
                <Spinner className="size-5 text-ai" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">Shopping for {itemOf(r.mandateId)}</span>
                  <span className="text-sm text-muted">{r.steps.at(-1)?.summary ?? "Waiting in the queue"}</span>
                </div>
                <ButtonLink href={`/shop/runs/${r.id}`} variant="secondary" size="sm">Watch</ButtonLink>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active mandates" value={active.length} detail={`${allMandates.length} in total`} />
        <StatTile label="Spent in 30 days" value={formatMoney(spent30)} detail={`${allPurchases.length} purchases so far`} />
        <StatTile label="Carts waiting for you" value={waiting.length} detail={waiting.length ? "Review before they expire" : "Nothing to approve"} />
        <StatTile
          label="Blocked by the gate"
          value={blocked.length}
          detail={stopped > 0 ? `${formatMoney(stopped)} never left your account` : "No rule-breaking carts"}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-semibold">Active mandates</h2>
            <Link href="/shop/mandates" className="text-sm font-semibold text-crypto hover:underline">All mandates</Link>
          </div>
          {active.length === 0 ? (
            <EmptyState title="No active mandates">
              <Link href="/shop/mandates/new" className="font-semibold text-crypto hover:underline">Create one</Link> when you need something.
            </EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">{active.slice(0, 4).map((m) => <MandateCard key={m.id} mandate={m} now={now} />)}</div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">Recent activity</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {activity.map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", a.tone)}><Icon name={a.icon} className="size-4" /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 text-sm">{a.text}</span>
                    <span className="text-xs text-muted">{formatRelative(a.at, now)}</span>
                  </span>
                  {a.amountMinor !== null && <Money amountMinor={a.amountMinor} className="text-sm font-semibold" />}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
