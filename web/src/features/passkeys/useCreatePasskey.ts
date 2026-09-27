"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api-error";
import { createPasskey, passkeyErrorMessage } from "@/lib/webauthn";
import { usePasskeyRegistrationOptionsMutation, useRegisterPasskeyMutation } from "./api";

/** Runs the whole passkey registration: server options → device prompt → server verification. */
export function useCreatePasskey() {
  const [getOptions] = usePasskeyRegistrationOptionsMutation();
  const [register] = useRegisterPasskeyMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(name: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const options = await getOptions().unwrap();
      const credential = await createPasskey(options.publicKey);
      await register({ challengeId: options.challengeId, credential, name }).unwrap();
      return true;
    } catch (err) {
      const apiMessage = errorMessage(err as Parameters<typeof errorMessage>[0]);
      setError(err && typeof err === "object" && "status" in err ? apiMessage : passkeyErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { create, busy, error };
}
