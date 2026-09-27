import type { ReactNode } from "react";
import { DEMO_USER } from "@/components/layout/navigation";
import { RequireSignIn } from "@/features/session";

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <RequireSignIn roles={["shopper"]} roleHint={DEMO_USER.shopper}>
      {children}
    </RequireSignIn>
  );
}
