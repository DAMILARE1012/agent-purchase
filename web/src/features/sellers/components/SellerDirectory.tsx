"use client";

import { useState } from "react";
import { Alert, Badge, ErrorState, LoadingState, PageHeader, SegmentedControl, Select } from "@/components/ui";
import { notify } from "@/features/notifications";
import { useGetBlockedCartsQuery } from "@/features/support";
import { errorMessage } from "@/lib/api-error";
import { formatDate } from "@/lib/dates";
import { useAppDispatch } from "@/store/hooks";
import type { Seller, SellerTier } from "@/types/domain";
import { useGetSellersQuery, useSetSellerTierMutation } from "../api";
import { SellerTierBadge, TIER } from "./SellerBits";

type Filter = "all" | "attention" | SellerTier;

interface SellerDirectoryProps {
  /** Admins can change tiers and suspend; support only reads. */
  canManage?: boolean;
}

/** Every seller, with tier, accounts and how often the gate refused their carts. */
export function SellerDirectory({ canManage = false }: SellerDirectoryProps) {
  const dispatch = useAppDispatch();
  const { data: sellers, error, isLoading } = useGetSellersQuery();
  const { data: blocked } = useGetBlockedCartsQuery();
  const [setTier, setting] = useSetSellerTierMutation();
  const [filter, setFilter] = useState<Filter>("all");

  const blockedFor = (id: string) => blocked?.filter((b) => b.sellerId === id).length ?? 0;
  const needsAttention = (s: Seller) => blockedFor(s.id) > 0 || s.accounts.some((a) => !a.verifiedAt);
  const shown = (sellers ?? []).filter((s) => filter === "all" || (filter === "attention" ? needsAttention(s) : s.tier === filter));

  async function change(s: Seller, tier: SellerTier) {
    const res = await setTier({ id: s.id, tier });
    if ("data" in res) dispatch(notify(`${s.displayName} is now ${TIER[tier].label.toLowerCase()}.`));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sellers"
        description={canManage
          ? "Verify sellers, set their tier and suspend them. Shoppers' mandates decide which tiers their AI may pay."
          : "The seller directory, for investigations. Tiers are set by admins."}
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
              { value: "all", label: "All", count: sellers?.length },
              { value: "attention", label: "Needs attention", count: sellers?.filter(needsAttention).length },
              { value: "verified", label: "Verified" },
              { value: "known", label: "Known" },
              { value: "new", label: "New" },
              { value: "suspended", label: "Suspended" },
            ]}
          />
          {setting.error && <Alert tone="bad">{errorMessage(setting.error)}</Alert>}
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[54rem] text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Seller</th>
                  <th className="px-4 py-2.5 font-semibold">Legal name</th>
                  <th className="px-4 py-2.5 font-semibold">Settlement accounts</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Carts refused</th>
                  <th className="px-4 py-2.5 font-semibold">Joined</th>
                  <th className="px-4 py-2.5 font-semibold">Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="px-4 py-3">
                      <span className="font-semibold">{s.displayName}</span>
                      <span className="block text-xs text-muted">{s.category} · {s.city}</span>
                      {s.adversarial && <Badge tone="ai" className="mt-1">Test attacker</Badge>}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{s.legalName}</td>
                    <td className="px-4 py-3">
                      {s.accounts.map((a) => (
                        <div key={a.accountNumberMasked} className="flex flex-col">
                          <span>{a.bankName} {a.accountNumberMasked}</span>
                          <span className={a.verifiedAt ? "text-xs text-muted" : "text-xs font-semibold text-bad"}>
                            {a.nameOnAccount}{a.verifiedAt ? "" : " · not verified"}
                          </span>
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{blockedFor(s.id) || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-2">{formatDate(s.joinedAt)}</td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <Select
                          aria-label={`Tier for ${s.displayName}`}
                          value={s.tier}
                          onChange={(e) => change(s, e.target.value as SellerTier)}
                          className="h-9 w-36 text-sm"
                        >
                          {(Object.keys(TIER) as SellerTier[]).map((t) => <option key={t} value={t}>{TIER[t].label}</option>)}
                        </Select>
                      ) : (
                        <SellerTierBadge tier={s.tier} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(TIER) as SellerTier[]).map((t) => (
              <div key={t} className="flex flex-col gap-1">
                <dt><SellerTierBadge tier={t} /></dt>
                <dd className="text-ink-2">{TIER[t].meaning}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
