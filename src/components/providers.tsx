"use client";

import { SessionProvider } from "next-auth/react";
import { ApolloWrapper } from "@/lib/apollo/client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      // Re-fetch /api/auth/session every 5 minutes. That endpoint runs our
      // Auth.js `jwt` callback, which refreshes the Okta access_token if
      // expired. Polling keeps the client-side session (and the token Apollo
      // attaches to each request) fresh while a tab sits idle.
      refetchInterval={5 * 60}
      // Also re-fetch when the tab regains focus. This is the Auth.js default,
      // but we set it explicitly so it's visible and hard to disable by accident.
      refetchOnWindowFocus={true}
    >
      <ApolloWrapper>{children}</ApolloWrapper>
    </SessionProvider>
  );
}
