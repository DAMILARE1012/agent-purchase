import type { Currency } from "@/types/api";

/**
 * The backend ledger still records the previous product's sandbox money in USD.
 * It switches to NGN in M7, when payments are reworked; until then the ledger
 * must not be shown with a naira sign.
 */
export const LEDGER_CURRENCY: Currency = "USD";
