import type { ReactNode } from "react";
import { DEMO_USER } from "@/components/layout/navigation";
import { RequireSignIn } from "@/features/session";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireSignIn roles={["admin"]} roleHint={DEMO_USER.admin}>
      {children}
    </RequireSignIn>
  );
}
