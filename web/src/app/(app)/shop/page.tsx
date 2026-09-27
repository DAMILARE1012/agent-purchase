import type { Metadata } from "next";
import { ShopperHome } from "@/features/dashboard";

export const metadata: Metadata = { title: "Home" };

export default function ShopperHomePage() {
  return <ShopperHome />;
}
