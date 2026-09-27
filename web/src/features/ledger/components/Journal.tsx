"use client";

import { useState } from "react";
import { Button, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import type { JournalQuery } from "@/types/api";
import { useGetJournalQuery } from "../api";
import { JournalEntryCard } from "./JournalEntryCard";

interface JournalProps {
  account?: string;
  tx?: string;
}

/** The journal, newest first, loaded one page at a time. */
export function Journal({ account, tx }: JournalProps) {
  // Each loaded page is its own cached query, keyed by its cursor.
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="divide-y divide-line">
        {cursors.map((before, i) => (
          <JournalPageView
            key={before ?? "first"}
            query={{ account, tx, before }}
            isLast={i === cursors.length - 1}
            onMore={(next) => setCursors((c) => [...c, next])}
          />
        ))}
      </div>
    </div>
  );
}

function JournalPageView({ query, isLast, onMore }: { query: JournalQuery; isLast: boolean; onMore: (cursor: string) => void }) {
  const { data, isLoading, error } = useGetJournalQuery(query);
  if (isLoading) return <LoadingState label="Loading journal…" />;
  if (error) return <div className="p-4"><ErrorState message={errorMessage(error)!} /></div>;
  if (!data) return null;
  if (data.entries.length === 0 && !query.before) {
    return <div className="p-4"><EmptyState title="No journal entries" /></div>;
  }
  return (
    <>
      {data.entries.map((e) => (
        <JournalEntryCard key={e.id} entry={e} />
      ))}
      {isLast && data.nextBefore && (
        <div className="flex justify-center p-3">
          <Button variant="secondary" size="sm" onClick={() => onMore(data.nextBefore!)}>Load older entries</Button>
        </div>
      )}
    </>
  );
}
