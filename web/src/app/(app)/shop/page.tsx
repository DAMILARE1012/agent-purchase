import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { ShopperHomePreview } from "@/features/previews/ShopperPreviews";

export const metadata: Metadata = { title: "Home" };

export default function ShopHomePage() {
  return (
    <PlannedPage
      title="Home"
      description="Your mandates, the carts waiting for you and what the AI has bought."
      milestone="M2"
      planned={[
        "Active mandates with spending against each limit",
        "Carts waiting for your approval, with the gate's checks",
        "Recent purchases and blocked attempts",
        "Spending this month",
      ]}
      preview={<ShopperHomePreview />}
    />
  );
}
