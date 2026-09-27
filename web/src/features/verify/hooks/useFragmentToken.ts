import { useSyncExternalStore } from "react";
import { extractToken } from "../lib/token";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const getHash = () => window.location.hash.slice(1);
const getServerHash = () => "";

/**
 * The receipt token from the URL fragment (/r#RCPT1...). The fragment never
 * reaches the server in the page request, so the token stays out of logs.
 */
export function useFragmentToken(): string | null {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  return hash ? extractToken(hash) : null;
}
