import type { ReactNode } from "react";
import { DEMO_USER } from "@/components/layout/navigation";
import { RequireSignIn } from "@/features/session";

export default function SellerLayout({ children }: { children: ReactNode }) {
  return (
    <RequireSignIn roles={["seller"]} roleHint={DEMO_USER.seller}>
      {children}
    </RequireSignIn>
  );
}
