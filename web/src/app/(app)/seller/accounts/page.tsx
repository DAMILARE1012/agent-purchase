import type { Metadata } from "next";
import { PlannedPage } from "@/components/layout/PlannedPage";
import { SellerAccountsPreview } from "@/features/previews/StaffPreviews";

export const metadata: Metadata = { title: "Bank accounts" };

export default function SellerAccountsPage() {
  return (
    <PlannedPage
      title="Bank accounts"
      description="Where shoppers' payments are sent."
      milestone="M3"
      planned={[
        "Registered accounts and their verification status",
        "Why the name on the account must match your registered name",
      ]}
      preview={<SellerAccountsPreview />}
    />
  );
}
