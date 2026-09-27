"use client";

import { Badge, Field, Icon, Input, Spinner } from "@/components/ui";
import type { LookupState } from "../hooks/useAccountLookup";
import { cleanAccountNumber } from "../lib/accountNumber";

interface AccountNumberFieldProps {
  value: string;
  onChange: (value: string) => void;
  lookup: LookupState;
  error?: string | null;
}

/** 10-digit account number input with the live name check underneath. */
export function AccountNumberField({ value, onChange, lookup, error }: AccountNumberFieldProps) {
  const fieldError = error ?? (lookup.status === "invalid" || lookup.status === "error" ? lookup.message : null);
  return (
    <div className="flex flex-col gap-2">
      <Field id="account-number" label="Account number" hint="10 digits" error={fieldError}>
        <Input
          id="account-number"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0000000000"
          value={value}
          onChange={(e) => onChange(cleanAccountNumber(e.target.value))}
          aria-invalid={Boolean(fieldError)}
          aria-describedby="account-name-check"
          className="font-mono text-lg tracking-[0.2em] tabular-nums"
        />
      </Field>
      <div id="account-name-check" aria-live="polite">
        {lookup.status === "loading" && (
          <p className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-muted">
            <Spinner className="size-4" /> Checking the account name…
          </p>
        )}
        {lookup.status === "found" && (
          <div className="flex items-center gap-3 rounded-lg border border-truth/50 bg-truth-bg px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-truth"><Icon name="check" className="size-4" /></span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate font-semibold uppercase tracking-wide">{lookup.account.accountName}</span>
              <span className="text-xs text-ink-2">Name confirmed by {lookup.account.bankName}</span>
            </div>
            <Badge tone={lookup.account.onPlatform ? "truth" : "crypto"}>{lookup.account.onPlatform ? "Instant" : "Other bank"}</Badge>
          </div>
        )}
      </div>
    </div>
  );
}
