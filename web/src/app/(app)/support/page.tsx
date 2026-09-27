import type { Metadata } from "next";
import { BlockedCarts } from "@/features/support";

export const metadata: Metadata = { title: "Blocked carts" };

export default function SupportPage() {
  return <BlockedCarts />;
}
