import type { Metadata } from "next";
import {
  Audience,
  Faq,
  FinalCta,
  Hero,
  HowItWorks,
  ProblemStrip,
  ProtectionGrid,
  SandboxInvite,
  SecuritySection,
} from "@/features/marketing";

export const metadata: Metadata = {
  title: { absolute: "Scan-to-Confirm · Don't trust the screenshot. Scan the receipt." },
  description:
    "Every payment comes with a signed QR receipt. Anyone who scans it sees the real payment, live from the ledger, so fake, edited and recycled receipts are caught.",
  openGraph: {
    title: "Scan-to-Confirm",
    description: "Verifiable receipts for everyday payments. Don't trust the screenshot. Scan the receipt.",
    type: "website",
  },
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <ProblemStrip />
      <HowItWorks />
      <ProtectionGrid />
      <Audience />
      <SecuritySection />
      <SandboxInvite />
      <Faq />
      <FinalCta />
    </>
  );
}
