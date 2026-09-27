"use client";

import type { ReactNode } from "react";
import { Alert, LoadingState } from "@/components/ui";
import { useViewer } from "../hooks/useViewer";
import { signIn } from "../lib/authLinks";
import { SignInPrompt } from "./SignInPrompt";

interface RequireSignInProps {
  children: ReactNode;
  /** Also require a wallet (members and businesses, not staff). */
  wallet?: boolean;
  /** Require one of these roles, e.g. ["analyst"]. */
  roles?: string[];
  roleHint?: { username: string; label: string };
}

export function RequireSignIn({ children, wallet = false, roles, roleHint }: RequireSignInProps) {
  const { user, isSignedIn, hasWallet, isLoading } = useViewer();
  if (isLoading) return <LoadingState />;
  if (!isSignedIn) return <SignInPrompt />;
  if (wallet && !hasWallet) {
    return <Alert tone="crypto" title="This account doesn't have a wallet">Staff accounts can&apos;t send or receive money.</Alert>;
  }
  if (roles && !roles.includes(user?.role ?? "")) {
    return (
      <Alert
        tone="crypto"
        title="You don't have access to this page"
        action={
          roleHint && (
            <button type="button" onClick={() => signIn({ loginHint: roleHint.username })} className="text-sm font-semibold text-crypto hover:underline">
              Sign in as {roleHint.label}
            </button>
          )
        }
      >
        {roleHint ? `It's for ${roleHint.label}'s role.` : "Ask an administrator for access."}
      </Alert>
    );
  }
  return <>{children}</>;
}
