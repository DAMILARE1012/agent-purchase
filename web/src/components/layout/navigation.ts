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

type StaffRole = Exclude<UserRole, "guest">;

const VERIFY: NavItem = { href: "/verify", label: "Verify a receipt", icon: "receipt" };

/** Each role gets its own workspace (system_design.md §4). */
const NAV: Record<StaffRole, NavSection[]> = {
  shopper: [
    {
      title: "Shopping",
      items: [
        { href: "/shop", label: "Home", icon: "home" },
        { href: "/shop/mandates", label: "Mandates", icon: "mandate" },
        { href: "/shop/runs", label: "AI shopping", icon: "bot" },
        { href: "/shop/purchases", label: "Purchases", icon: "cart" },
      ],
    },
    { title: "Money", items: [{ href: "/shop/balance", label: "Balance", icon: "wallet" }] },
  ],
  seller: [
    {
      title: "Store",
      items: [
        { href: "/seller", label: "Orders", icon: "box" },
        { href: "/seller/catalog", label: "Catalog", icon: "store" },
        { href: "/seller/accounts", label: "Bank accounts", icon: "bank" },
      ],
    },
    { title: "Tools", items: [VERIFY] },
  ],
  analyst: [
    {
      title: "Support",
      items: [
        { href: "/support", label: "Blocked carts", icon: "shield" },
        { href: "/support/disputes", label: "Disputes", icon: "flag" },
        { href: "/support/sellers", label: "Sellers", icon: "store" },
      ],
    },
    { title: "Tools", items: [VERIFY] },
  ],
  ops: [
    {
      title: "Agent",
      items: [
        { href: "/ops", label: "Overview", icon: "gauge" },
        { href: "/ops/agents", label: "Agent versions", icon: "layers" },
        { href: "/ops/traces", label: "Run traces", icon: "trace" },
      ],
    },
    {
      title: "Quality",
      items: [
        { href: "/ops/evals", label: "Evaluations", icon: "flask" },
        { href: "/ops/range", label: "Test marketplace", icon: "target" },
      ],
    },
    { title: "Money", items: [{ href: "/ops/ledger", label: "Platform ledger", icon: "ledger" }] },
  ],
  admin: [
    {
      title: "Directory",
      items: [
        { href: "/admin", label: "Sellers", icon: "store" },
        { href: "/admin/users", label: "Users", icon: "users" },
      ],
    },
  ],
};

export function navFor(role: UserRole | undefined): NavSection[] {
  return role && role !== "guest" ? NAV[role] : [{ title: "Tools", items: [VERIFY] }];
}

/** Where each role lands after signing in. */
export function homeFor(role: UserRole | undefined): string {
  return role && role !== "guest" ? NAV[role][0].items[0].href : "/verify";
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  shopper: "Shopper",
  seller: "Seller",
  analyst: "Support analyst",
  ops: "Ops · LLM engineer",
  admin: "Admin",
};

/** Demo accounts, for "sign in as…" hints on pages a role can't open. */
export const DEMO_USER: Record<StaffRole, { username: string; label: string }> = {
  shopper: { username: "sam", label: "Sam (shopper)" },
  seller: { username: "ada", label: "Ada (seller)" },
  analyst: { username: "morgan", label: "Morgan (support analyst)" },
  ops: { username: "olivia", label: "Olivia (ops)" },
  admin: { username: "kemi", label: "Kemi (admin)" },
};

const TITLES: Array<[prefix: string, title: string]> = [
  ...Object.values(NAV).flatMap((sections) => sections.flatMap((s) => s.items.map((i): [string, string] => [i.href, i.label]))),
  ["/shop/mandates/new", "New mandate"],
  ["/support/runs", "Run trace"],
  ["/shop/purchases", "Purchases"],
  ["/verify", "Verify a receipt"],
  ["/signin-error", "Sign in"],
];

export function titleFor(pathname: string): string {
  // Longest matching prefix wins, so /shop/mandates beats /shop.
  const match = TITLES.filter(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)).sort((a, b) => b[0].length - a[0].length)[0];
  return match?.[1] ?? "Mandate Gate";
}

/** Section roots (/shop, /seller…) are only active on their exact path. */
export function isActive(pathname: string, href: string): boolean {
  const isRoot = href.split("/").length === 2;
  return pathname === href || (!isRoot && pathname.startsWith(`${href}/`));
}
