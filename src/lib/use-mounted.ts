"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Returns false during SSR, true after hydration — lets client components gate
// browser-only work without triggering a hydration mismatch, and without the
// useEffect(() => setMounted(true)) pattern that set-state-in-effect forbids.
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
