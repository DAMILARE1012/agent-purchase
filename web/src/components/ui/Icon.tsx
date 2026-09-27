import { cn } from "@/lib/cn";

// A small, consistent line-icon set (24px grid, 1.8 stroke). Decorative by default.
const PATHS = {
  // Product and marketing
  signature: "M4 20h16M6 16l3-9 3 6 2-4 4 7",
  ledger: "M5 4h14v16H5zM9 4v16M12 9h4M12 13h4",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
  forged: "M6 3h9l3 3v15H6zM9 12l6 6M15 12l-6 6",
  edited: "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3",
  recycled: "M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5",
  reversed: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  overpay: "M12 3v18M16 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  shop: "M4 9l2-5h12l2 5M4 9v11h16V9M4 9h16M9 20v-6h6v6",
  key: "M15 7a4 4 0 1 1-3.9 5H4v3h3v-3M12 8h.01",
  check: "M5 12l5 5 9-10",
  // App navigation and actions
  home: "M4 11l8-7 8 7M6 9.5V20h12V9.5",
  send: "M4 12l16-8-6 16-3-6zM11 14l9-10",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowDown: "M12 5v14M6 13l6 6 6-6",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  alert: "M12 4 2.5 20h19zM12 10v4M12 17h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  refresh: "M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5",
  // Mandate Gate
  cart: "M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2M9 20h.01M17 20h.01",
  mandate: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5M10 8h1",
  bot: "M8 8V5h8v3M5 8h14v11H5zM9 13h.01M15 13h.01M10 16h4M12 2v3",
  receipt: "M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21zM9 8h6M9 12h6M9 16h3",
  store: "M4 10v10h16V10M3 10l1.5-6h15L21 10a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0M10 20v-5h4v5",
  box: "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10",
  bank: "M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3l9 5H3z",
  wallet: "M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4zM4 7V6a2 2 0 0 1 2-2h10M16 13.5h.01",
  flask: "M9 3h6M10 3v6L4.5 19a1.3 1.3 0 0 0 1.2 2h12.6a1.3 1.3 0 0 0 1.2-2L14 9V3M7 15h10",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  trace: "M4 6h6M4 12h10M4 18h7M17 6h3M19 12h1M14 18h6",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
  gauge: "M4 18a8 8 0 1 1 16 0M12 18l4-6M8 18h.01M16 18h.01",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M18 14a6 6 0 0 1 4 7",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, label }: { name: IconName; className?: string; label?: string }) {
  return (
    <svg
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-5 shrink-0", className)}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
