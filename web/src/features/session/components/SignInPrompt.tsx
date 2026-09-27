"use client";

import { Alert, Button } from "@/components/ui";
import { signIn } from "../lib/authLinks";

/** Shown where a page needs a signed-in user. */
export function SignInPrompt({ title = "Sign in to continue", children }: { title?: string; children?: React.ReactNode }) {
  return (
    <Alert
      tone="crypto"
      title={title}
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => signIn({ register: true })}>Create account</Button>
          <Button size="sm" onClick={() => signIn()}>Sign in</Button>
        </div>
      }
    >
      {children ?? "You can still verify a receipt without signing in."}
    </Alert>
  );
}
