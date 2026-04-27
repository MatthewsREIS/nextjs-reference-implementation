"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";
import { ApolloWrapper } from "./apollo-client";

// Re-fetch /api/auth/session every 5 minutes in production. That endpoint
// runs our Auth.js `jwt` callback, which refreshes the Okta access_token if
// expired. Polling keeps the client-side session (and the token Apollo
// attaches to each request) fresh while a tab sits idle. If
// NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS is set (test mode), we poll that often
// instead so refreshed tokens propagate quickly enough to observe.
const DEFAULT_REFETCH_SECONDS = 5 * 60;
const DEBUG_TTL_SECONDS =
  Number(process.env.NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS) || undefined;
// Enforce a 10-second minimum even in debug mode — a one-second poll
// would DoS /api/auth/session with no benefit.
const MIN_DEBUG_REFETCH_SECONDS = 10;
const REFETCH_INTERVAL_SECONDS =
  DEBUG_TTL_SECONDS !== undefined
    ? Math.max(MIN_DEBUG_REFETCH_SECONDS, DEBUG_TTL_SECONDS)
    : DEFAULT_REFETCH_SECONDS;

export function MatthewsGraphqlProviderClient({
  children,
  session,
}: {
  children: ReactNode;
  session?: Session | null;
}) {
  return (
    <SessionProvider
      session={session ?? undefined}
      refetchInterval={REFETCH_INTERVAL_SECONDS}
      // Also re-fetch when the tab regains focus. This is the Auth.js default,
      // but we set it explicitly so it's visible and hard to disable by accident.
      refetchOnWindowFocus={true}
    >
      <ApolloWrapper>{children}</ApolloWrapper>
    </SessionProvider>
  );
}
