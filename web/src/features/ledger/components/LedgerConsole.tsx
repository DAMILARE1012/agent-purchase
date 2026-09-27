"use client";

import { useState } from "react";
import { Button, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { api } from "@/store/api";
import { useAppDispatch } from "@/store/hooks";
import { useGetLedgerAccountsQuery, useGetLedgerSummaryQuery } from "../api";
import { AccountsTable } from "./AccountsTable";
import { Journal } from "./Journal";
import { TransferCounts } from "./TransferCounts";
import { TrialBalance } from "./TrialBalance";

const REFRESH_MS = 15_000;

/** The platform's books, for the ops (finance) role. */
export function LedgerConsole() {
  const dispatch = useAppDispatch();
  const summary = useGetLedgerSummaryQuery(undefined, { pollingInterval: REFRESH_MS, refetchOnFocus: true });
  const accounts = useGetLedgerAccountsQuery(undefined, { pollingInterval: REFRESH_MS, refetchOnFocus: true });
  const [account, setAccount] = useState<string | null>(null);
  const selected = accounts.data?.find((a) => a.id === account);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Platform ledger"
        description="Every money movement is a balanced journal entry. Entries are never edited; corrections are new entries."
        actions={
          <Button variant="secondary" size="sm" onClick={() => dispatch(api.util.invalidateTags(["Ledger"]))}>
            Refresh
          </Button>
        }
      />

      {summary.isLoading && <LoadingState label="Loading the ledger…" />}
      {summary.error && <ErrorState message={errorMessage(summary.error)!} />}
      {summary.data && (
        <>
          <TrialBalance summary={summary.data} />
          <TransferCounts counts={summary.data.transferCounts} />
        </>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Accounts</h2>
        <p className="text-sm text-ink-2">Balance is credits minus debits. Select an account to filter the journal.</p>
        {accounts.data && <AccountsTable accounts={accounts.data} selected={account} onSelect={setAccount} />}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Journal{selected && <span className="text-ink-2"> · {selected.name}</span>}
          </h2>
          {selected && <Button variant="ghost" size="sm" onClick={() => setAccount(null)}>Show all accounts</Button>}
        </div>
        <Journal key={account ?? "all"} account={account ?? undefined} />
      </section>
    </div>
  );
}
