import type { Metadata } from "next";
import { RequireSignIn } from "@/features/session";
import { ActivityPage } from "@/features/wallet";

export const metadata: Metadata = { title: "Activity" };

export default function Activity() {
  return (
    <RequireSignIn wallet>
      <ActivityPage />
    </RequireSignIn>
  );
}
