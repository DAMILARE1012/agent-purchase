import { useSyncExternalStore } from "react";

// One shared clock for "3 minutes ago", countdowns and period filters, so
// components never call Date.now() during render (React requires pure renders).

const TICK_MS = 15_000;
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** The current time in ms, refreshed every 15 seconds. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now, () => now);
}
