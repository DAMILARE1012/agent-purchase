import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";

export const metadata: Metadata = { title: "Verify a receipt" };

/** Public: sellers (or anyone) check that a purchase was authorised by the shopper. */
export default function VerifyPage() {
  return (
    <PlannedPage
      title="Verify a receipt"
      description="Check that a purchase was authorised by the shopper, allowed by the gate and paid."
      milestone="M2"
      planned={[
        "Scan the receipt's QR code, upload it or paste its link",
        "Platform signature, the shopper's mandate, the gate decision and the bank payment, each checked",
        "What was bought, from whom, and for how much",
      ]}
    />
  );
}
