"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, ErrorState, Icon, LoadingState, PageHeader } from "@/components/ui";
import { AccountNumberField, BankSelect, useAccountLookup } from "@/features/banking";
import { notify } from "@/features/notifications";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/dates";
import { DEMO_MODE } from "@/lib/demo";
import { useAppDispatch } from "@/store/hooks";
import { useGetMySellerProfileQuery, useRegisterAccountMutation, useRemoveAccountMutation } from "../api";

/** Where shoppers' payments go, and why the name on each account matters. */
export function SellerAccounts() {
  const dispatch = useAppDispatch();
  const { data: seller, error, isLoading } = useGetMySellerProfileQuery();
  const [remove, removing] = useRemoveAccountMutation();

  async function removeAccount(bankCode: string, accountNumber: string) {
    const res = await remove({ bankCode, accountNumber });
    if ("data" in res) dispatch(notify("Account removed."));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={seller?.displayName}
        title="Bank accounts"
        description="Shoppers' payments only go to an account the bank confirms is in your registered legal name."
      />
      {isLoading ? (
        <LoadingState />
      ) : error || !seller ? (
        <ErrorState message={errorMessage(error) ?? ""} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-1">
              <span className="text-sm text-muted">Registered legal name</span>
              <span className="font-display text-xl font-semibold">{seller.legalName}</span>
              <span className="text-sm text-ink-2">The gate compares this with the bank&apos;s name for the account on every cart.</span>
            </Card>
            {removing.error && <Alert tone="bad">{errorMessage(removing.error)}</Alert>}
            <ul className="flex flex-col gap-3">
              {seller.accounts.map((a) => (
                <li key={`${a.bankCode}-${a.accountNumberMasked}`}>
                  <Card className="flex items-center gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted"><Icon name="bank" /></span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{a.bankName} {a.accountNumber ?? a.accountNumberMasked}</span>
                      <span className="truncate text-sm text-ink-2">Bank&apos;s name: {a.nameOnAccount}</span>
                      {a.verifiedAt && <span className="text-xs text-muted">Verified {formatDateTime(a.verifiedAt)}</span>}
                    </div>
                    {a.verifiedAt ? (
                      <Badge tone="truth">Can receive</Badge>
                    ) : (
                      <div className="flex flex-col items-end gap-2">
                        <Badge tone="bad">Name doesn&apos;t match</Badge>
                        {a.accountNumber && (
                          <Button size="sm" variant="secondary" loading={removing.isLoading && removing.originalArgs?.accountNumber === a.accountNumber}
                            onClick={() => removeAccount(a.bankCode, a.accountNumber!)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </div>
          <AddAccount legalName={seller.legalName} />
        </div>
      )}
    </div>
  );
}

function AddAccount({ legalName }: { legalName: string }) {
  const dispatch = useAppDispatch();
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const lookup = useAccountLookup(bankCode, accountNumber);
  const [register, registering] = useRegisterAccountMutation();

  async function add() {
    if (lookup.status !== "found") return;
    const res = await register({ bankCode, accountNumber });
    if ("data" in res && res.data) {
      const added = res.data.accounts.at(-1);
      dispatch(notify(added?.verifiedAt ? "Account added. It can receive payments." : "Account added, but it can't receive payments: the name doesn't match.", added?.verifiedAt ? "success" : "error"));
      setAccountNumber("");
    }
  }

  const mismatch = lookup.status === "found" && lookup.account.accountName.toUpperCase().replace(/[^A-Z0-9]/g, "") !== legalName.toUpperCase().replace(/[^A-Z0-9]/g, "");

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold">Add an account</h2>
      <BankSelect value={bankCode} onChange={setBankCode} externalOnly />
      <AccountNumberField value={accountNumber} onChange={setAccountNumber} lookup={lookup} />
      {mismatch && (
        <Alert tone="bad" title="This account isn't in your registered name">
          The bank says it belongs to {lookup.status === "found" ? lookup.account.accountName : ""}. You can add it, but the gate won&apos;t send
          shoppers&apos; money to it.
        </Alert>
      )}
      {registering.error && <Alert tone="bad">{errorMessage(registering.error)}</Alert>}
      <Button onClick={add} disabled={lookup.status !== "found"} loading={registering.isLoading} className="self-start">Add account</Button>
      {DEMO_MODE && (
        <p className="text-sm text-muted">
          Sandbox: Ada&apos;s Meridian Bank account <span className="font-mono">1030000044</span> is already registered. Try Meridian Bank{" "}
          <span className="font-mono">1030000010</span> to see a name that doesn&apos;t match.
        </p>
      )}
    </Card>
  );
}
