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
  title: { absolute: "Mandate Gate · Let AI shop for you. Your limits decide what it pays." },
  description:
    "An AI shopper finds the cart; a gate outside the AI checks it against the limits you signed and the seller's real bank account before any transfer.",
  openGraph: {
    title: "Mandate Gate",
    description: "Safe payments for AI shopping. The AI suggests; your mandate decides.",
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
