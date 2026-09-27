"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeFor } from "@/components/layout/navigation";
import { LoadingState } from "@/components/ui";
import { useViewer } from "../hooks/useViewer";
import { SignInPrompt } from "./SignInPrompt";

export function RoleHomeRedirect() {
  const router = useRouter();
  const { user, isSignedIn, isLoading } = useViewer();

  useEffect(() => {
    if (isSignedIn && user) router.replace(homeFor(user.role));
  }, [isSignedIn, user, router]);

  if (!isLoading && !isSignedIn) return <SignInPrompt />;
  return <LoadingState label="Opening your workspace…" />;
}
