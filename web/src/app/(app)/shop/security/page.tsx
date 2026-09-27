import type { Metadata } from "next";
import { PasskeysPanel } from "@/features/passkeys";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return <PasskeysPanel />;
}
