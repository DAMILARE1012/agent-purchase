"use client";

import { useState, type ReactNode } from "react";
import { Alert, Button, Dialog, Icon } from "@/components/ui";

interface PasskeyDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** What the signature covers, shown exactly. */
  children: ReactNode;
  confirmLabel: string;
  /** Called after the (simulated) passkey check; returns when the action finishes. */
  onConfirm: () => Promise<void>;
  error?: string | null;
}

/**
 * Approval step. Until M6 this simulates the passkey prompt; M6 replaces it with
 * a WebAuthn assertion whose challenge is the mandate (or cart) hash.
 */
export function PasskeyDialog({ open, onClose, title, children, confirmLabel, onConfirm, error }: PasskeyDialogProps) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 700)); // The device's fingerprint or face prompt.
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title={title}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-lg bg-crypto-bg p-3 text-sm text-ink">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-crypto"><Icon name="key" /></span>
          <span>Your device will ask for your fingerprint, face or screen lock. The signature covers exactly what&apos;s below.</span>
        </div>
        <div className="text-sm">{children}</div>
        {error && <Alert tone="bad" title="Not approved">{error}</Alert>}
        <p className="text-xs text-muted">Sandbox: the passkey prompt is simulated until milestone M6.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={confirm} loading={busy}><Icon name="key" className="size-4" /> {confirmLabel}</Button>
        </div>
      </div>
    </Dialog>
  );
}
