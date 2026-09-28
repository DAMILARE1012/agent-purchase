import type { ReactNode } from "react";
import { MarketingFooter, MarketingHeader } from "@/features/marketing";

/** Public pages: always on white (see .theme-light), whatever the device's theme. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="theme-light flex min-h-screen flex-1 flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
