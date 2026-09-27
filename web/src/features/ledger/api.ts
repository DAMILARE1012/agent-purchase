import type { JournalPage, JournalQuery, LedgerAccount, LedgerSummary } from "@/types/api";
import { api } from "@/store/api";

export const ledgerApi = api.injectEndpoints({
  endpoints: (build) => ({
    getLedgerSummary: build.query<LedgerSummary, void>({
      query: () => "ledger/summary",
      providesTags: ["Ledger"],
    }),
    getLedgerAccounts: build.query<LedgerAccount[], void>({
      query: () => "ledger/accounts",
      providesTags: ["Ledger"],
    }),
    getJournal: build.query<JournalPage, JournalQuery>({
      query: ({ account, tx, before }) => ({ url: "ledger/journal", params: { account, tx, before, limit: 20 } }),
      providesTags: ["Ledger"],
    }),
  }),
});

export const { useGetLedgerSummaryQuery, useGetLedgerAccountsQuery, useGetJournalQuery } = ledgerApi;
