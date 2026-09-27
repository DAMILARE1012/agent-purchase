"use client";

import { setupListeners } from "@reduxjs/toolkit/query";
import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { makeStore } from "./store";

/** One store per browser tab, created on first render. */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);
  // Enables refetchOnFocus / refetchOnReconnect for queries that ask for it.
  useEffect(() => setupListeners(store.dispatch), [store]);
  return <Provider store={store}>{children}</Provider>;
}
