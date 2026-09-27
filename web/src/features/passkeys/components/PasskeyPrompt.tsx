"use client";

import { useState, type ReactNode } from "react";
import { Alert, Button, Dialog, Icon, LoadingState } from "@/components/ui";
import { errorMessage } from "@/lib/api-error";
import { deviceName, passkeyErrorMessage, passkeysSupported } from "@/lib/webauthn";
import { useGetPasskeysQuery } from "../api";
import { useCreatePasskey } from "../useCreatePasskey";

interface PasskeyPromptProps {
  open: boolean;
  onClose: () => void;
  title: string;
  confirmLabel: string;
  /** Exactly what the signature covers. */
  children: ReactNode;
  /**
   * The whole ceremony: ask the server for a challenge, sign it on the device, send it back.
   * Throw (an API error or the browser's) to show what went wrong.
   */
  onSign: () => Promise<void>;
  errorTitle?: string;
}

/** A WebAuthn signature over something exact. Shoppers without a passkey create one here first. */
export function PasskeyPrompt({ open, onClose, title, confirmLabel, children, onSign, errorTitle = "Not signed" }: PasskeyPromptProps) {
  const passkeys = useGetPasskeysQuery(undefined, { skip: !open });
  const setup = useCreatePasskey();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = passkeysSupported();
  const hasPasskey = (passkeys.data?.length ?? 0) > 0;

  function close() {
    if (busy || setup.busy) return;
    setError(null);
    onClose();
  }

  async function sign() {
    setBusy(true);
    setError(null);
    try {
      await onSign();
    } catch (err) {
      setError(err && typeof err === "object" && "status" in err ? errorMessage(err as Parameters<typeof errorMessage>[0]) : passkeyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const banner = (text: ReactNode) => (
    <div className="flex items-center gap-3 rounded-lg bg-crypto-bg p-3 text-sm text-ink">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-crypto"><Icon name="key" /></span>
      <span>{text}</span>
    </div>
  );

  return (
    <Dialog open={open} onClose={close} title={hasPasskey || !supported ? title : "Create a passkey first"}>
      <div className="flex flex-col gap-4">
        {!supported ? (
          <Alert tone="bad" title="This browser can't use passkeys">
            Open the app on a phone or computer with a fingerprint, face or screen lock.
          </Alert>
        ) : passkeys.isLoading ? (
          <LoadingState />
        ) : !hasPasskey ? (
          <>
            {banner("A passkey lives on this device and is unlocked by your fingerprint, face or screen lock. It signs your mandates and approves payments, so nobody else can.")}
            {setup.error && <Alert tone="bad" title="No passkey created">{setup.error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={setup.busy}>Cancel</Button>
              <Button onClick={() => setup.create(deviceName())} loading={setup.busy}><Icon name="key" className="size-4" /> Create passkey</Button>
            </div>
          </>
        ) : (
          <>
            {banner("Your device will ask for your fingerprint, face or screen lock. The signature covers exactly what's below.")}
            <div className="text-sm">{children}</div>
            {error && <Alert tone="bad" title={errorTitle}>{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
              <Button onClick={sign} loading={busy}><Icon name="key" className="size-4" /> {confirmLabel}</Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
