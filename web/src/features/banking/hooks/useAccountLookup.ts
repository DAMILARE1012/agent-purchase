import { skipToken } from "@reduxjs/toolkit/query";
import { errorMessage } from "@/lib/api-error";
import type { NameEnquiry } from "@/types/api";
import { useLookupAccountQuery } from "../api";
import { isValidAccountNumber } from "../lib/accountNumber";

export type LookupState =
  | { status: "idle" }
  | { status: "invalid"; message: string }
  | { status: "loading" }
  | { status: "found"; account: NameEnquiry }
  | { status: "error"; message: string };

/**
 * Runs a name enquiry once the bank is chosen and a valid 10-digit number is
 * entered. The check digit is verified locally first, so typos never reach the network.
 */
export function useAccountLookup(bankCode: string, accountNumber: string): LookupState {
  const complete = accountNumber.length === 10;
  const valid = complete && isValidAccountNumber(accountNumber);
  const query = useLookupAccountQuery(bankCode && valid ? { bankCode, accountNumber } : skipToken);

  if (!complete) return { status: "idle" };
  if (!valid) return { status: "invalid", message: "That account number isn't valid. Check the 10 digits." };
  if (!bankCode) return { status: "idle" };
  if (query.isFetching) return { status: "loading" };
  if (query.error) return { status: "error", message: errorMessage(query.error) ?? "We couldn't check that account." };
  if (query.data) return { status: "found", account: query.data };
  return { status: "loading" };
}
