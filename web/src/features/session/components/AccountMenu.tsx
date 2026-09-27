"use client";

import { Badge, Button } from "@/components/ui";
import { useViewer } from "../hooks/useViewer";
import { signIn } from "../lib/authLinks";
import { SignOutButton } from "./SignOutButton";

const ROLE_LABEL: Record<string, string> = {
  merchant: "Business",
  analyst: "Risk analyst",
  ops: "Platform finance",
};

/** Header account area: sign in / create account, or who you are and sign out. */
export function AccountMenu() {
  const { user, isSignedIn, isLoading } = useViewer();

  if (isLoading) return <div className="h-8 w-40 animate-pulse rounded-md bg-surface-2" />;

  if (!isSignedIn || !user) {
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => signIn({ register: true, returnTo: "/wallet" })}>
          Create account
        </Button>
        <Button size="sm" onClick={() => signIn()}>Sign in</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-end leading-tight">
        <span className="text-sm font-semibold">{user.displayName}</span>
        <span className="text-xs text-muted">{user.handle}</span>
      </div>
      {ROLE_LABEL[user.role] && <Badge tone="crypto">{ROLE_LABEL[user.role]}</Badge>}
      <SignOutButton />
    </div>
  );
}
