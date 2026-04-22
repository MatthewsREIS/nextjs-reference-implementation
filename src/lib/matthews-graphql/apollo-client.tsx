"use client";

/**
 * Client-side Apollo setup. Three links, in this order:
 *
 *   1. authLink     — reads the current Okta access token from a ref (kept in
 *                     sync with useSession) and sets the Authorization header.
 *   2. refreshLink  — if a request comes back 401, forces next-auth to refresh
 *                     the session (which runs our jwt callback and rotates the
 *                     Okta access_token), updates the ref, and retries the
 *                     operation ONCE. A second 401 bubbles up as a normal
 *                     error; the `RefreshAccessTokenError` flag on the session
 *                     will surface to the UI.
 *   3. httpLink     — plain POST to the GraphQL API endpoint.
 *
 * Server-side (RSC) Apollo lives in ./server.ts and does not need this —
 * `auth()` already triggers a refresh check on every RSC request.
 */

import { ApolloLink, HttpLink, ServerError } from "@apollo/client";
import {
  ApolloClient,
  ApolloNextAppProvider,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";
import { SetContextLink } from "@apollo/client/link/context";
import { ErrorLink } from "@apollo/client/link/error";
import { getSession, useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { from as rxFrom, switchMap } from "rxjs";

type TokenRef = { current: string | undefined };

function clientGraphqlUrl(): string {
  const v = process.env.NEXT_PUBLIC_GRAPHQL_API_URL;
  if (!v) {
    throw new Error(
      "[matthews-graphql] Missing required env var NEXT_PUBLIC_GRAPHQL_API_URL. See README → Local setup.",
    );
  }
  return v;
}

function makeClient(tokenRef: TokenRef) {
  const authLink = new SetContextLink((prev) => {
    const prevHeaders = (prev.headers ?? {}) as Record<string, string>;
    return {
      headers: {
        ...prevHeaders,
        ...(tokenRef.current
          ? { authorization: `Bearer ${tokenRef.current}` }
          : {}),
      },
    };
  });

  const refreshLink = new ErrorLink(({ error, operation, forward }) => {
    if (!ServerError.is(error) || error.statusCode !== 401) return;

    const ctx = operation.getContext() as { _refreshed?: boolean };
    if (ctx._refreshed) return; // already retried once — give up
    operation.setContext({ _refreshed: true });

    return rxFrom(getSession()).pipe(
      switchMap((session) => {
        tokenRef.current = session?.accessToken;
        operation.setContext((prev: { headers?: Record<string, string> }) => ({
          headers: {
            ...(prev.headers ?? {}),
            ...(session?.accessToken
              ? { authorization: `Bearer ${session.accessToken}` }
              : {}),
          },
        }));
        return forward(operation);
      }),
    );
  });

  const httpLink = new HttpLink({
    uri: clientGraphqlUrl(),
  });

  return new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([authLink, refreshLink, httpLink]),
  });
}

export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  const { data } = useSession();
  // `ApolloNextAppProvider` only calls `makeClient` once, so we can't capture
  // the current access token by closure. A ref gives the link chain a stable
  // handle to a value we update whenever the session rotates. (Writing to
  // refs in render is disallowed by React Compiler, so we do it in an
  // effect — children of `ApolloWrapper` mount after this effect runs, so
  // the very first client query already sees the populated token.)
  const tokenRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    tokenRef.current = data?.accessToken;
  }, [data?.accessToken]);

  return (
    <ApolloNextAppProvider makeClient={() => makeClient(tokenRef)}>
      {children}
    </ApolloNextAppProvider>
  );
}
