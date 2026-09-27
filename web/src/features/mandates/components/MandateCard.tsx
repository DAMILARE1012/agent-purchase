import Link from "next/link";
import { formatDateTime, formatRelative } from "@/lib/dates";
import type { Mandate } from "@/types/domain";
import { MandateStatusBadge, ModeBadge, SpendMeter } from "./MandateBits";

export function MandateCard({ mandate, now }: { mandate: Mandate; now: number }) {
  const m = mandate;
  const usesLeft = Math.max(0, m.limits.maxUses - m.uses);
  return (
    <Link
      href={`/shop/mandates/${m.id}`}
      className="group flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="truncate font-display text-lg font-semibold group-hover:underline">{m.limits.item}</h3>
          <p className="line-clamp-2 text-sm text-muted">“{m.request}”</p>
        </div>
        <MandateStatusBadge status={m.status} />
      </div>
      <SpendMeter mandate={m} />
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <ModeBadge mode={m.mode} />
        {m.status === "active" ? (
          <>
            <span>{usesLeft === 1 ? "1 use left" : `${usesLeft} uses left`}</span>
            <span title={formatDateTime(m.limits.expiresAt)}>Expires {formatRelative(m.limits.expiresAt, now)}</span>
          </>
        ) : m.status === "revoked" && m.revokedAt ? (
          <span>Cancelled {formatRelative(m.revokedAt, now)}</span>
        ) : (
          <span>Signed {formatRelative(m.signedAt, now)}</span>
        )}
      </div>
    </Link>
  );
}
