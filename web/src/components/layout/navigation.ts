import type { IconName } from "@/components/ui/Icon";
import type { UserRole } from "@/types/api";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const VERIFY: NavItem = { href: "/r", label: "Verify a receipt", icon: "qr" };

/** Each role sees only what it can use. */
export function navFor(role: UserRole | undefined, hasWallet: boolean): NavSection[] {
  if (hasWallet) {
    return [
      {
        title: "Money",
        items: [
          { href: "/wallet", label: "Overview", icon: "home" },
          { href: "/send", label: "Send money", icon: "send" },
          { href: "/activity", label: "Activity", icon: "list" },
        ],
      },
      { title: "Trust", items: [VERIFY] },
    ];
  }
  if (role === "analyst") {
    return [
      { title: "Risk", items: [{ href: "/risk", label: "Case queue", icon: "shield" }] },
      { title: "Tools", items: [VERIFY] },
    ];
  }
  if (role === "ops") {
    return [
      { title: "Finance", items: [{ href: "/ledger", label: "Platform ledger", icon: "ledger" }] },
      { title: "Tools", items: [VERIFY] },
    ];
  }
  return [{ title: "Tools", items: [VERIFY] }];
}

const TITLES: Array<[prefix: string, title: string]> = [
  ["/wallet", "Overview"],
  ["/send", "Send money"],
  ["/activity", "Activity"],
  ["/transactions", "Payment"],
  ["/r", "Verify a receipt"],
  ["/risk", "Risk console"],
  ["/ledger", "Platform ledger"],
  ["/signin-error", "Sign in"],
];

export function titleFor(pathname: string): string {
  return TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? "Scan-to-Confirm";
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
