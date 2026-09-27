import type { Metadata } from "next";
import { ReceiptVerifier } from "@/features/purchases";

export const metadata: Metadata = { title: "Verify a receipt" };

export default function ReceiptVerifierPage() {
  return <ReceiptVerifier />;
}
