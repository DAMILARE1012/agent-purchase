"use client";

import { useMemo, useState } from "react";
import { Alert, ButtonLink, ErrorState, LoadingState, SegmentedControl, StatTile } from "@/components/ui";
import { SignInPrompt, useViewer } from "@/features/session";
import { useListTransfersQuery } from "@/features/transfers";
import { errorMessage } from "@/lib/api-error";
import { greeting } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { useGetWalletQuery } from "../api";
import { attentionItems, dailyFlows, incomingPendingMinor, PERIOD_OPTIONS, topContacts, totals, type Period } from "../lib/insights";
import { ActivityTable } from "./ActivityTable";
import { AttentionPanel } from "./AttentionPanel";
import { BalanceCard } from "./BalanceCard";
import { CashFlowChart } from "./CashFlowChart";
import { QuickPay } from "./QuickPay";

const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** The home screen for members and businesses. */
export function MemberDashboard() {
  const { user, isSignedIn, hasWallet, isLoading: sessionLoading } = useViewer();
  const wallet = useGetWalletQuery(undefined, { skip: !hasWallet, refetchOnFocus: true });
  const transfersQuery = useListTransfersQuery(undefined, { skip: !hasWallet, refetchOnFocus: true });
  const [period, setPeriod] = useState<Period>("30");

  const transfers = useMemo(() => transfersQuery.data ?? [], [transfersQuery.data]);
  const days = Number(period);
  const flows = useMemo(() => dailyFlows(transfers, days), [transfers, days]);
  const sums = useMemo(() => totals(transfers, days), [transfers, days]);
  const attention = useMemo(() => attentionItems(transfers), [transfers]);
  const contacts = useMemo(() => topContacts(transfers), [transfers]);

  if (sessionLoading) return <LoadingState />;
  if (!isSignedIn) return <SignInPrompt title="Sign in to see your wallet">New accounts get a $500.00 sandbox balance.</SignInPrompt>;
  if (!hasWallet) {
    const staff = user?.role === "ops" ? { href: "/ledger", label: "Open the platform ledger" } : { href: "/risk", label: "Open the risk console" };
    return (
      <Alert tone="crypto" title="This account doesn't have a wallet" action={<ButtonLink href={staff.href} size="sm">{staff.label}</ButtonLink>}>
        Staff accounts can&apos;t send or receive money.
      </Alert>
    );
  }
  if (wallet.isLoading || transfersQuery.isLoading) return <LoadingState label="Loading your dashboard…" />;
  if (wallet.error || transfersQuery.error) return <ErrorState message={errorMessage(wallet.error ?? transfersQuery.error)!} />;
  if (!wallet.data) return null;

  const net = sums.inMinor - sums.outMinor;
  const periodLabel = PERIOD_OPTIONS.find((p) => p.value === period)!.label;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{today.format(new Date())}</p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {greeting()}, {user?.displayName.split(" ")[0]}
          </h1>
        </div>
        <SegmentedControl label="Period" value={period} options={PERIOD_OPTIONS} onChange={setPeriod} size="md" />
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr]">
        <BalanceCard wallet={wallet.data} incomingPendingMinor={incomingPendingMinor(transfers)} />
        <StatTile
          label="Money in"
          marker="var(--chart-in)"
          value={formatMoney(sums.inMinor)}
          detail={`${sums.inCount} settled payment${sums.inCount === 1 ? "" : "s"} · last ${periodLabel}`}
        />
        <StatTile
          label="Money out"
          marker="var(--chart-out)"
          value={formatMoney(sums.outMinor)}
          detail={
            <>
              {sums.outCount} settled payment{sums.outCount === 1 ? "" : "s"} · net{" "}
              <span className="font-semibold text-ink">{net >= 0 ? "+" : "−"}{formatMoney(Math.abs(net))}</span>
            </>
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <section className="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Cash flow</h2>
            <span className="text-xs text-muted">Settled payments per day · last {periodLabel}</span>
          </div>
          <CashFlowChart days={flows} />
        </section>
        <AttentionPanel items={attention} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <ActivityTable transfers={transfers} limit={8} />
        <QuickPay contacts={contacts} />
      </div>
    </div>
  );
}
