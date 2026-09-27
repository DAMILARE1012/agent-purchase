"use client";

import Link from "next/link";
import { useState } from "react";
import { ButtonLink, EmptyState, ErrorState, Icon, LoadingState, PageHeader, SegmentedControl } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { useNow } from "@/lib/useNow";
import { useGetMandatesQuery } from "../api";
import { MandateCard } from "./MandateCard";

type Filter = "active" | "all";

export function MandatesList() {
  const { data, error, isLoading } = useGetMandatesQuery();
  const [filter, setFilter] = useState<Filter>("active");
  const now = useNow();

  const active = data?.filter((m) => m.status === "active") ?? [];
  const shown = filter === "active" ? active : (data ?? []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mandates"
        description="The limits you've signed. The AI shopper can never spend outside them."
        actions={<ButtonLink href="/shop/mandates/new"><Icon name="mandate" className="size-4" /> New mandate</ButtonLink>}
      />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={errorMessage(error) ?? ""} />
      ) : (
        <>
          <SegmentedControl
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "active", label: "Active", count: active.length },
              { value: "all", label: "All", count: data?.length ?? 0 },
            ]}
          />
          {shown.length === 0 ? (
            <EmptyState title={filter === "active" ? "No active mandates" : "No mandates yet"}>
              Tell the AI what to buy and set its limits. <Link href="/shop/mandates/new" className="font-semibold text-crypto hover:underline">Create a mandate</Link>
            </EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((m) => <MandateCard key={m.id} mandate={m} now={now} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
