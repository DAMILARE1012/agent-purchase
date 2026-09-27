"use client";

import { Badge, Button, Card, Icon } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import type { Mandate } from "@/types/domain";
import { useGetMandateSignatureQuery } from "../api";

/** The mandate's signature, re-verified by the server from the stored assertion. */
export function SignatureCard({ mandate: m }: { mandate: Mandate }) {
  const { data: check, isFetching, refetch } = useGetMandateSignatureQuery(m.id);
  const isTest = (check?.kind ?? m.signatureKind) === "test";

  return (
    <Card className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Icon name="key" className="size-5 text-crypto" /> Signature</h2>
        {check && (isTest ? (
          <Badge tone="ai">Test signature (sandbox)</Badge>
        ) : check.valid && check.hashMatches ? (
          <Badge tone="truth">Verified</Badge>
        ) : (
          <Badge tone="bad">Doesn&apos;t verify</Badge>
        ))}
      </div>
      <p className="text-ink-2">
        {isTest
          ? `Signed by a sandbox test script on ${formatDateTime(m.signedAt)}, not by a passkey.`
          : `Signed with your passkey${check?.passkeyName ?? m.signedWith ? ` “${check?.passkeyName ?? m.signedWith}”` : ""} on ${formatDateTime(m.signedAt)}.`}{" "}
        The signature covers this hash of the exact limits:
      </p>
      <p className="break-all rounded-md bg-surface-2 px-3 py-2 font-mono text-xs">{m.mandateHash}</p>
      {check && !isTest && (
        <p className="text-xs text-muted">
          {check.valid && check.hashMatches
            ? "Checked just now: the stored signature is valid and the limits still hash to the signed value."
            : !check.hashMatches
              ? "The limits no longer hash to the signed value. The gate won't pay under this mandate."
              : "The stored signature doesn't verify against your passkey. The gate won't pay under this mandate."}
        </p>
      )}
      <Button size="sm" variant="secondary" className="self-start" loading={isFetching} onClick={() => refetch()}>Check again</Button>
      {m.compiledBy && <p className="text-xs text-muted">Limits drafted by {m.compiledBy}.</p>}
    </Card>
  );
}
