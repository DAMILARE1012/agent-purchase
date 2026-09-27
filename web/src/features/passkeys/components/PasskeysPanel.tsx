"use client";

import { useState, useSyncExternalStore } from "react";
import { Alert, Button, Card, EmptyState, ErrorState, Field, Icon, Input, LoadingState, PageHeader } from "@/components/ui";
import { notify } from "@/features/notifications";
import { errorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/dates";
import { deviceName, passkeysSupported } from "@/lib/webauthn";
import { useAppDispatch } from "@/store/hooks";
import { useGetPasskeysQuery, useRemovePasskeyMutation } from "../api";
import { useCreatePasskey } from "../useCreatePasskey";

const noSubscribe = () => () => {};

/** The shopper's passkeys: what signs their mandates. */
export function PasskeysPanel() {
  const dispatch = useAppDispatch();
  const { data, error, isLoading } = useGetPasskeysQuery();
  const [remove, removing] = useRemovePasskeyMutation();
  const { create, busy, error: createError } = useCreatePasskey();
  // The browser's name is only known on the client; the server renders the fallback.
  const suggested = useSyncExternalStore(noSubscribe, deviceName, () => "This device");
  const [typed, setName] = useState<string | null>(null);
  const name = typed ?? suggested;
  const supported = useSyncExternalStore(noSubscribe, passkeysSupported, () => true);

  async function add() {
    if (await create(name)) dispatch(notify("Passkey created."));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Security"
        description="Your passkeys sign your mandates. Nobody, including the platform, can create or widen a mandate without one."
      />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={errorMessage(error) ?? ""} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-semibold">Your passkeys</h2>
            {removing.error && <Alert tone="bad">{errorMessage(removing.error)}</Alert>}
            {!data?.length ? (
              <EmptyState title="No passkeys yet">Create one to sign mandates. It uses this device&apos;s fingerprint, face or screen lock.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.map((p) => (
                  <li key={p.id}>
                    <Card className="flex items-center gap-4">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-crypto-bg text-crypto"><Icon name="key" /></span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-sm text-muted">
                          Created {formatDateTime(p.createdAt)}{p.lastUsedAt ? ` · last used ${formatDateTime(p.lastUsedAt)}` : ""}
                        </span>
                      </div>
                      <Button size="sm" variant="secondary" loading={removing.isLoading && removing.originalArgs === p.id} onClick={() => remove(p.id)}>
                        Remove
                      </Button>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-muted">A passkey that signed a mandate can&apos;t be removed: the signature must stay verifiable.</p>
          </section>
          <Card className="flex flex-col gap-4">
            <h2 className="font-display text-lg font-semibold">Add a passkey</h2>
            {!supported ? (
              <Alert tone="ai">This browser can&apos;t create passkeys. Use a phone or computer with a screen lock.</Alert>
            ) : (
              <>
                <Field id="passkey-name" label="Name" hint="So you can tell your devices apart">
                  <Input id="passkey-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                </Field>
                {createError && <Alert tone="bad">{createError}</Alert>}
                <Button onClick={add} loading={busy} className="self-start"><Icon name="key" className="size-4" /> Create passkey</Button>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
