"use client";

import { useState } from "react";
import { PasskeyPrompt } from "@/features/passkeys";
import { signWithPasskey } from "@/lib/webauthn";
import type { Mandate, MandateDraft, MandateLimits, MandateMode } from "@/types/domain";
import { useCreateMandateMutation, useMandateSignOptionsMutation } from "../api";
import { LimitsTable } from "./LimitsTable";

interface MandateSignDialogProps {
  open: boolean;
  onClose: () => void;
  draft: MandateDraft;
  limits: MandateLimits;
  mode: MandateMode;
  onSigned: (mandate: Mandate) => void;
}

/**
 * Signs the exact limits with the shopper's passkey. The server's challenge commits
 * to the mandate hash, so the signature can't be reused for any other limits.
 */
export function MandateSignDialog({ open, onClose, draft, limits, mode, onSigned }: MandateSignDialogProps) {
  const [getOptions] = useMandateSignOptionsMutation();
  const [create] = useCreateMandateMutation();
  const [hash, setHash] = useState<string | null>(null);

  async function sign() {
    const options = await getOptions({ draft, limits }).unwrap();
    setHash(options.mandateHash);
    const credential = await signWithPasskey(options.publicKey);
    onSigned(await create({ draft, limits, signature: { kind: "passkey", challengeId: options.challengeId, credential } }).unwrap());
  }

  return (
    <PasskeyPrompt open={open} onClose={() => { setHash(null); onClose(); }} title="Sign this mandate" confirmLabel="Sign" onSign={sign}>
      <LimitsTable limits={limits} mode={mode} compact />
      {hash && (
        <>
          <p className="mt-3 text-muted">Mandate hash being signed</p>
          <p className="break-all rounded-md bg-surface-2 px-3 py-2 font-mono text-xs">{hash}</p>
        </>
      )}
    </PasskeyPrompt>
  );
}
