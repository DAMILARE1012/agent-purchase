import type { ReactNode } from "react";
import { DEMO_USER } from "@/components/layout/navigation";
import { RequireSignIn } from "@/features/session";

export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <RequireSignIn roles={["ops"]} roleHint={DEMO_USER.ops}>
      {children}
    </RequireSignIn>
  );
}
