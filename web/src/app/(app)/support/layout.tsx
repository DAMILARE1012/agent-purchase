import type { ReactNode } from "react";
import { DEMO_USER } from "@/components/layout/navigation";
import { RequireSignIn } from "@/features/session";

export default function SupportLayout({ children }: { children: ReactNode }) {
  return (
    <RequireSignIn roles={["analyst"]} roleHint={DEMO_USER.analyst}>
      {children}
    </RequireSignIn>
  );
}
