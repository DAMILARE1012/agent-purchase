import { useSyncExternalStore } from "react";
import { extractToken } from "../lib/token";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const getHash = () => window.location.hash.slice(1);
const getServerHash = () => "";

/**
 * The receipt token from the URL fragment (/verify#MG1...). The fragment never
 * reaches the server in the page request, so the token stays out of logs.
 */
export function useFragmentToken(): string | null {
  const hash = useSyncExternalStore(subscribe, getHash, getServerHash);
  return hash ? extractToken(hash) : null;
}

/** Puts a token in the fragment (or clears it), so the result can be shared or reloaded. */
export function setFragmentToken(token: string | null) {
  if (token) {
    window.location.hash = token; // Fires hashchange itself.
    return;
  }
  history.replaceState(null, "", window.location.pathname + window.location.search);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
