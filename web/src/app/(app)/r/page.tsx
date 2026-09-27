import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/ui";
import { VerifyScreen } from "@/features/verify";

export const metadata: Metadata = {
  title: "Verify a receipt",
  // Receipt pages are private; keep them out of search engines.
  robots: { index: false, follow: false },
};

/** Receipt QR codes open this page: /r#RCPT1.<payload>.<signature> */
export default function VerifyPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <VerifyScreen />
    </Suspense>
  );
}
