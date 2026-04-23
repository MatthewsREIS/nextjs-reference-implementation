import NextAuth, { type Account, type Session } from "next-auth";
import Okta from "next-auth/providers/okta";
import type { JWT } from "next-auth/jwt";
import { redirect } from "next/navigation";
import {
  HttpLink,
  type ApolloClient as ApolloClientType,
  type OperationVariables,
} from "@apollo/client";
import { ServerError } from "@apollo/client/errors";
import {
  registerApolloClient,
  ApolloClient,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";
import { authConfig } from "./config";
import { requiredEnv } from "./env";

// This module pulls in NextAuth + the Node-only Apollo integration. Importing
// it from an edge runtime silently ships Node-only code into the edge bundle
// and fails at request time. Fail loudly at module load instead.
if (process.env.NEXT_RUNTIME === "edge") {
  throw new Error(
    "[matthews-graphql] /server is Node-only and was imported from an edge runtime. Use @/lib/matthews-graphql/proxy for edge code.",
  );
}

const OKTA_SCOPES = "openid profile email offline_access";

// Optional debug knobs. Leave both env vars unset in production.
//   NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS  — override access-token lifetime
//   AUTH_DEBUG_LOG_TOKENS               — log fingerprints on sign-in/refresh
// Read lazily inside the callbacks so tests can `vi.stubEnv` without
// re-importing the module.
function debugTtlSeconds(): number | undefined {
  return Number(process.env.NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS) || undefined;
}

const fp = (t?: string | null) =>
  t ? `${t.slice(0, 8)}…${t.slice(-8)}` : "(none)";
const log = (...args: unknown[]) => {
  if (process.env.AUTH_DEBUG_LOG_TOKENS === "true")
    console.log("[auth]", ...args);
};

// Okta returns token lifetimes two different ways: `account.expires_at` is
// absolute (seconds since epoch), `refreshed.expires_in` is relative (seconds
// from now). Both branches honour the same debug-TTL override, so the two
// helpers exist to keep callers from re-implementing it inconsistently.
function expiresAtFromDuration(oktaExpiresInSeconds: number | undefined) {
  const ttl = debugTtlSeconds() ?? oktaExpiresInSeconds;
  return ttl ? Math.floor(Date.now() / 1000) + ttl : undefined;
}

function expiresAtFromAbsolute(oktaExpiresAt: number | undefined) {
  const debug = debugTtlSeconds();
  if (debug !== undefined) return Math.floor(Date.now() / 1000) + debug;
  return oktaExpiresAt;
}

// Okta rotates the refresh token on every successful use. If two requests
// land with the same expired access token, the serverless jwt callback is
// invoked twice concurrently — and without coordination both POST the same
// refresh_token. The first wins; the second fails with `invalid_grant` and
// flags the session as broken. We coalesce concurrent refreshes keyed on
// the incoming refresh token so the second caller awaits the first's result.
const inflightRefreshes = new Map<string, Promise<JWT>>();

export function _resetRefreshCacheForTests() {
  inflightRefreshes.clear();
}

async function doRefresh(token: JWT): Promise<JWT> {
  log("refreshing — old access:", fp(token.accessToken));
  try {
    const res = await fetch(
      `${requiredEnv("AUTH_OKTA_ISSUER")}/oauth2/v1/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: token.refreshToken!,
          client_id: requiredEnv("AUTH_OKTA_ID"),
          scope: OKTA_SCOPES,
        }),
      },
    );
    const refreshed = await res.json();
    if (!res.ok) throw refreshed;

    log("refreshed — new access: ", fp(refreshed.access_token));
    return {
      ...token,
      accessToken: refreshed.access_token as string,
      expiresAt: expiresAtFromDuration(
        refreshed.expires_in as number | undefined,
      ),
      refreshToken:
        (refreshed.refresh_token as string | undefined) ?? token.refreshToken,
      error: undefined,
    };
  } catch (e) {
    console.error("[auth] token refresh failed:", e);
    return { ...token, error: "RefreshAccessTokenError" as const };
  }
}

async function refreshWithDedup(token: JWT): Promise<JWT> {
  const key = token.refreshToken!;
  const existing = inflightRefreshes.get(key);
  if (existing) return existing;
  const pending = doRefresh(token).finally(() => {
    inflightRefreshes.delete(key);
  });
  inflightRefreshes.set(key, pending);
  return pending;
}

export async function jwtCallback({
  token,
  account,
}: {
  token: JWT;
  account?: Account | null;
}): Promise<JWT> {
  if (account) {
    // Real config guard: without a refresh_token, the session dies when the
    // access token expires. Means the Okta app is misconfigured (missing
    // Refresh Token grant type, or offline_access not granted).
    if (!account.refresh_token) {
      throw new Error(
        "[auth] Okta did not return a refresh_token. Check the app's grant types (Refresh Token enabled) and that `offline_access` appears in the granted scope.",
      );
    }
    log(
      "initial sign-in — access:",
      fp(account.access_token),
      "refresh:",
      fp(account.refresh_token),
    );
    return {
      ...token,
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiresAt: expiresAtFromAbsolute(account.expires_at),
    };
  }

  if (token.expiresAt && Date.now() < token.expiresAt * 1000) {
    return token;
  }

  if (!token.refreshToken) {
    return { ...token, error: "NoRefreshToken" as const };
  }

  return refreshWithDedup(token);
}

export async function sessionCallback({
  session,
  token,
}: {
  session: Session;
  token: JWT;
}): Promise<Session> {
  session.accessToken = token.accessToken;
  if (token.error) session.error = token.error;
  return session;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Okta({
      authorization: { params: { scope: OKTA_SCOPES } },
      // Public OIDC client — no client secret. Auth.js still sends a PKCE
      // challenge (via the default provider `checks: ["pkce", "state"]`).
      client: { token_endpoint_auth_method: "none" },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt: jwtCallback,
    session: sessionCallback,
  },
});

// One ApolloClient per request in RSC, with the Okta access_token attached.
// `registerApolloClient` ensures the same instance is reused within a single
// request and a fresh one is built per request — required for token isolation.
const { getClient, query, PreloadQuery } = registerApolloClient(() => {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: requiredEnv("GRAPHQL_API_URL"),
      fetch: async (input, init) => {
        const session = await auth();
        const headers = new Headers(init?.headers);
        if (session?.accessToken) {
          headers.set("Authorization", `Bearer ${session.accessToken}`);
        }
        return fetch(input, { ...init, headers });
      },
    }),
  });
});

export { query, PreloadQuery };

// Server-side mutation helper for Server Actions and Route Handlers. Apollo's
// `client.mutate()` returns `{ data?, error?, extensions? }` without throwing
// on error, which is the opposite convention from `query()` (which throws).
// `mutate()` normalises that: it throws on GraphQL/network errors and returns
// the narrowed `data` so the caller doesn't need to unwrap the optional.
//
// Use this in Server Actions (`"use server"`) and Route Handlers; after the
// mutation, call `revalidatePath(...)` / `revalidateTag(...)` from
// `next/cache` if the action should re-render any RSCs that read the same
// data. See `src/app/actions.ts` for the worked example used by Card 8.
export async function mutate<
  TData = unknown,
  TVariables extends OperationVariables = OperationVariables,
>(
  options: ApolloClientType.MutateOptions<TData, TVariables>,
): Promise<TData> {
  const client = getClient();
  const result = await client.mutate<TData, TVariables>(options);
  if (result.error) throw result.error;
  if (result.data === undefined) {
    // `errorPolicy: 'ignore' | 'all'` can return undefined data without an
    // error — but we don't set either policy in this package, so this
    // branch only fires on a malformed upstream response. Surface it loudly
    // rather than handing a silently-empty result to the caller.
    throw new Error(
      "[matthews-graphql] mutate: Apollo returned no data and no error",
    );
  }
  return result.data;
}

// Session narrowed to guarantee `user` is present — what callers get back from
// requireSession() so they don't need optional chaining on `session.user`.
export type AuthenticatedSession = Omit<Session, "error"> & {
  user: NonNullable<Session["user"]>;
  // NoRefreshToken was redirected away by requireSession; only the
  // recoverable RefreshAccessTokenError can still be present here.
  error?: "RefreshAccessTokenError";
};

// `proxy.ts` already gates routes, but RSC pages re-check session at render
// time so a stale or torn-down session bounces to /login instead of rendering
// an empty page. `NoRefreshToken` means the refresh token is gone — no recovery
// is possible — so treat it the same as no session. `RefreshAccessTokenError`
// is recoverable on the next request, so it's surfaced to the caller via
// `session.error` rather than redirected away.
export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await auth();
  if (!session?.user || session.error === "NoRefreshToken") {
    redirect("/login");
  }
  return session as AuthenticatedSession;
}

// RSC Apollo (`query`, `PreloadQuery`) refreshes pre-emptively: the custom
// `fetch` in the HttpLink above calls `await auth()` on every request, which
// re-runs the `jwt` callback and rotates an expired access token before the
// header is written. `safeQuery` catches the residual failure mode — a
// session whose previous refresh already failed (`session.error ===
// "RefreshAccessTokenError"`), which `requireSession` intentionally passes
// through. Such sessions render with a cached-but-rejected access token and
// the query 401s. On `ok: false` (`reason: "stale-token-401"`), the caller
// renders a CSR fallback that routes through the client Apollo's
// response-level `ErrorLink`, which re-fetches the session and retries.
// Every non-401 error is re-thrown so real bugs (validation, 500s, non-auth
// failures) surface loudly instead of hiding behind a CSR fallback that
// would also fail. Do not use this as a general-purpose try/catch.
export type SafeQueryResult<TData> =
  | { ok: true; data: TData }
  | { ok: false; reason: "stale-token-401"; error: ServerError };

export async function safeQuery<
  TData = unknown,
  TVariables extends OperationVariables = OperationVariables,
>(
  options: ApolloClientType.QueryOptions<TData, TVariables>,
): Promise<SafeQueryResult<TData>> {
  try {
    const { data } = await query<TData, TVariables>(options);
    if (data === undefined) {
      // Apollo 4's query() throws on GraphQL errors; an undefined data here
      // indicates a malformed upstream response. Don't hide it behind
      // ok:true — bubble it up so the bug is visible.
      throw new Error(
        "[matthews-graphql] safeQuery: Apollo returned no data and no error",
      );
    }
    return { ok: true, data };
  } catch (error) {
    if (ServerError.is(error) && error.statusCode === 401) {
      return { ok: false, reason: "stale-token-401", error };
    }
    throw error;
  }
}
