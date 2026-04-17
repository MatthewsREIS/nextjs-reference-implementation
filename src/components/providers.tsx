"use client";

import { SessionProvider } from "next-auth/react";
import { ApolloWrapper } from "@/lib/apollo/client";

// Re-fetch /api/auth/session every 5 minutes in production. That endpoint runs
// our Auth.js `jwt` callback, which refreshes the Okta access_token if expired.
// Polling keeps the client-side session (and the token Apollo attaches to each
// request) fresh while a tab sits idle. If NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS
// is set (test mode), we poll that often instead so refreshed tokens propagate
// quickly enough to observe.
const DEFAULT_REFETCH_SECONDS = 5 * 60;
const DEBUG_TTL_SECONDS =
  Number(process.env.NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS) || undefined;
const REFETCH_INTERVAL_SECONDS = DEBUG_TTL_SECONDS ?? DEFAULT_REFETCH_SECONDS;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={REFETCH_INTERVAL_SECONDS}
      // Also re-fetch when the tab regains focus. This is the Auth.js default,
      // but we set it explicitly so it's visible and hard to disable by accident.
      refetchOnWindowFocus={true}
    >
      <ApolloWrapper>{children}</ApolloWrapper>
    </SessionProvider>
  );
}
