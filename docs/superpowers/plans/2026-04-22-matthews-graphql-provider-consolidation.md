# MatthewsGraphqlProvider Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the current Okta auth + Apollo (client + RSC) + token-refresh setup into a single in-tree package at `src/lib/matthews-graphql/`, exposing `<MatthewsGraphqlProvider>` as the only thing `layout.tsx` needs for auth + GraphQL to "just work."

**Architecture:** All logic currently spread across `src/auth.ts`, `src/auth.config.ts`, `src/lib/apollo/{client,server}.{ts,tsx}`, `src/components/providers.tsx`, and `src/types/next-auth.d.ts` moves into `src/lib/matthews-graphql/` with four subpath entries (`index`, `/server`, `/proxy`, `/route`). Filesystem-locked files (`src/proxy.ts`, `src/app/api/auth/[...nextauth]/route.ts`) become 1-line re-exports. `<MatthewsGraphqlProvider>` is an async RSC that calls `auth()` internally so `layout.tsx` never has to.

**Tech Stack:** Next.js 16 (App Router, Turbopack), Auth.js v5 (`next-auth@beta`) with Okta provider, Apollo Client 4 + `@apollo/client-integration-nextjs`, TypeScript, Vitest, bun.

**Scope:** This is a behaviour-preserving refactor. No new public behaviour. Existing tests are the correctness contract; they move alongside their code.

**Reference spec:** `docs/superpowers/specs/2026-04-22-matthews-graphql-provider-consolidation-design.md`

---

## File plan

### New files

| Path | Responsibility |
|---|---|
| `src/lib/matthews-graphql/next-auth.d.ts` | Module augmentation for `Session.accessToken`, `Session.error`, `JWT` fields |
| `src/lib/matthews-graphql/env.ts` | Server-only `requiredEnv(name)` helper that throws with an actionable message |
| `src/lib/matthews-graphql/config.ts` | Edge-safe `NextAuthConfig` subset (pages, `authorized` callback, empty providers) |
| `src/lib/matthews-graphql/server.ts` | NextAuth() call, jwt/session callbacks with refresh + dedup, `registerApolloClient()`. Exports `handlers`, `auth`, `signIn`, `signOut`, `query`, `PreloadQuery`, `jwtCallback`, `sessionCallback`, `_resetRefreshCacheForTests` |
| `src/lib/matthews-graphql/apollo-client.tsx` | `"use client"` — `ApolloWrapper` with authLink + refreshLink + httpLink chain |
| `src/lib/matthews-graphql/provider-client.tsx` | `"use client"` — `MatthewsGraphqlProviderClient` wraps SessionProvider + ApolloWrapper |
| `src/lib/matthews-graphql/provider.tsx` | `MatthewsGraphqlProvider` async RSC; calls `auth()`, renders `MatthewsGraphqlProviderClient session` |
| `src/lib/matthews-graphql/index.ts` | Public barrel — exports `MatthewsGraphqlProvider` only |
| `src/lib/matthews-graphql/route.ts` | `export const { GET, POST } = handlers` from `./server` |
| `src/lib/matthews-graphql/proxy.ts` | Edge-safe — `NextAuth(authConfig)` from `./config` only; exports default + matcher config |

### Test files (moved from current locations)

| Path | Source |
|---|---|
| `src/lib/matthews-graphql/server.test.ts` | `src/auth.test.ts` (import retargeted) |
| `src/lib/matthews-graphql/config.test.ts` | `src/auth.config.test.ts` (import retargeted; default → named) |
| `src/lib/matthews-graphql/proxy.test.ts` | `src/proxy.test.ts` (import retargeted) |
| `src/lib/matthews-graphql/provider-client.test.tsx` | `src/components/providers.test.tsx` (retargeted at new client component) |

### Files edited (import retargets only)

- `src/app/layout.tsx` — drops `await auth()` and `<Providers>`, uses `<MatthewsGraphqlProvider>`
- `src/app/page.tsx` — imports from `@/lib/matthews-graphql/server`
- `src/app/login/page.tsx` — `signIn` from `@/lib/matthews-graphql/server`
- `src/components/sign-out-button.tsx` — `signOut` from `@/lib/matthews-graphql/server`
- `src/app/api/auth/[...nextauth]/route.ts` — shrunk to 1-line re-export
- `src/proxy.ts` — shrunk to 1-line re-export

### Files deleted at the end

- `src/auth.ts`
- `src/auth.config.ts`
- `src/lib/apollo/client.tsx`
- `src/lib/apollo/server.ts`
- `src/lib/apollo/` (empty dir removed)
- `src/components/providers.tsx`
- `src/types/next-auth.d.ts`
- `src/types/` (empty dir removed)

### Docs edited

- `README.md` — architecture diagram + "How the pieces connect" table simplified; new "Building pages and components" section
- `AGENTS.md` — new "Building new routes and components" block

---

## Verification commands

After each task, unless the task description says otherwise, run:

```bash
bun run build
bun run test
bun run lint
```

All three must pass. `bun run build` catches runtime-boundary violations (edge bundle vs. server bundle vs. client bundle), `bun run test` runs the vitest suite, `bun run lint` runs ESLint with `--max-warnings 0`.

---

## Task 1: Scaffold package directory with type augmentation + env helper

**Files:**
- Create: `src/lib/matthews-graphql/next-auth.d.ts`
- Create: `src/lib/matthews-graphql/env.ts`

- [ ] **Step 1: Create the package directory**

```bash
mkdir -p src/lib/matthews-graphql
```

- [ ] **Step 2: Write the `next-auth.d.ts` module augmentation**

Create `src/lib/matthews-graphql/next-auth.d.ts` with this exact content (identical to the existing `src/types/next-auth.d.ts` — we keep it intact while both locations coexist for one task):

```ts
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshAccessTokenError" | "NoRefreshToken";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: "RefreshAccessTokenError" | "NoRefreshToken";
  }
}
```

Declaring the same augmentation in two files at once is safe — TypeScript merges identical interface declarations. We will delete `src/types/next-auth.d.ts` in Task 9.

- [ ] **Step 3: Write the `env.ts` helper**

Create `src/lib/matthews-graphql/env.ts`:

```ts
export function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[matthews-graphql] Missing required env var ${name}. See README → Local setup.`,
    );
  }
  return v;
}
```

Lazy-by-construction: each call site decides when to validate. Tests that mock `next-auth` never trigger these paths so they don't have to stub every env var.

- [ ] **Step 4: Verify build succeeds**

```bash
bun run build
```

Expected: clean exit. No new code is imported yet; this just confirms the new files parse.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matthews-graphql/next-auth.d.ts src/lib/matthews-graphql/env.ts
git commit -m "refactor(auth): scaffold matthews-graphql package with type augmentation and env helper"
```

---

## Task 2: Add edge-safe config module

**Files:**
- Create: `src/lib/matthews-graphql/config.ts`

- [ ] **Step 1: Write `config.ts`**

Create `src/lib/matthews-graphql/config.ts`:

```ts
import type { NextAuthConfig } from "next-auth";

// Edge-safe subset of the Auth.js config. `proxy.ts` (Next.js 16's renamed
// middleware) imports this module, which MUST NOT pull in Node-only code
// such as the full Okta provider.
export const authConfig: NextAuthConfig = {
  providers: [], // populated in ./server
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      if (isOnLogin) return true;
      // A session whose refresh token can never be recovered is effectively
      // dead — bounce to /login so the user re-authenticates cleanly instead
      // of lingering in a half-broken state where every API call 401s.
      if (auth?.error === "NoRefreshToken") return false;
      return !!auth?.user;
    },
  },
};
```

Named export `authConfig` (the current file uses a default export; we switch to named for clarity — callers will be updated in Tasks 6 and 8).

- [ ] **Step 2: Verify build succeeds**

```bash
bun run build
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add src/lib/matthews-graphql/config.ts
git commit -m "refactor(auth): add edge-safe matthews-graphql config module"
```

---

## Task 3: Add server entry — NextAuth + RSC Apollo

**Files:**
- Create: `src/lib/matthews-graphql/server.ts`

- [ ] **Step 1: Write `server.ts`**

Create `src/lib/matthews-graphql/server.ts`:

```ts
import NextAuth, { type Account, type Session } from "next-auth";
import Okta from "next-auth/providers/okta";
import type { JWT } from "next-auth/jwt";
import { HttpLink } from "@apollo/client";
import {
  registerApolloClient,
  ApolloClient,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";
import { authConfig } from "./config";
import { requiredEnv } from "./env";

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
export const { query, PreloadQuery } = registerApolloClient(() => {
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
```

This file combines the current `src/auth.ts` (NextAuth + callbacks + dedup) and `src/lib/apollo/server.ts` (RSC Apollo client) verbatim, with `requiredEnv()` replacing `process.env.X!`.

- [ ] **Step 2: Verify build succeeds**

```bash
bun run build
```

Expected: clean exit. The module compiles but nothing imports it yet.

- [ ] **Step 3: Commit**

```bash
git add src/lib/matthews-graphql/server.ts
git commit -m "refactor(auth): add matthews-graphql server entry with NextAuth and RSC Apollo"
```

---

## Task 4: Add client-side Apollo module

**Files:**
- Create: `src/lib/matthews-graphql/apollo-client.tsx`

- [ ] **Step 1: Write `apollo-client.tsx`**

Create `src/lib/matthews-graphql/apollo-client.tsx`:

```tsx
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
```

Content is lifted verbatim from `src/lib/apollo/client.tsx`, with two small changes: the file extension is `.tsx`, and `NEXT_PUBLIC_GRAPHQL_API_URL` is now validated via `clientGraphqlUrl()` (matching the `requiredEnv` error-message pattern without importing the server-only `env.ts`).

- [ ] **Step 2: Verify build succeeds**

```bash
bun run build
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add src/lib/matthews-graphql/apollo-client.tsx
git commit -m "refactor(auth): add client-side Apollo module with auth/refresh link chain"
```

---

## Task 5: Add client provider wrapper

**Files:**
- Create: `src/lib/matthews-graphql/provider-client.tsx`

- [ ] **Step 1: Write `provider-client.tsx`**

Create `src/lib/matthews-graphql/provider-client.tsx`:

```tsx
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
const REFETCH_INTERVAL_SECONDS = DEBUG_TTL_SECONDS ?? DEFAULT_REFETCH_SECONDS;

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
```

This is the same wiring as today's `src/components/providers.tsx`, relocated and renamed.

- [ ] **Step 2: Verify build succeeds**

```bash
bun run build
```

Expected: clean exit.

- [ ] **Step 3: Commit**

```bash
git add src/lib/matthews-graphql/provider-client.tsx
git commit -m "refactor(auth): add MatthewsGraphqlProviderClient combining SessionProvider and ApolloWrapper"
```

---

## Task 6: Add async RSC provider, barrel, route, and proxy entries

**Files:**
- Create: `src/lib/matthews-graphql/provider.tsx`
- Create: `src/lib/matthews-graphql/index.ts`
- Create: `src/lib/matthews-graphql/route.ts`
- Create: `src/lib/matthews-graphql/proxy.ts`

- [ ] **Step 1: Write `provider.tsx`**

Create `src/lib/matthews-graphql/provider.tsx`:

```tsx
import type { ReactNode } from "react";
import { auth } from "./server";
import { MatthewsGraphqlProviderClient } from "./provider-client";

// Async React Server Component: reads the session on the server so
// SessionProvider hydrates with it and the Apollo authLink has the access
// token on the very first client render — no /api/auth/session round-trip on
// hydrate. Builders only ever write `<MatthewsGraphqlProvider>{children}
// </MatthewsGraphqlProvider>` in layout.tsx; everything else is internal.
export async function MatthewsGraphqlProvider({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  return (
    <MatthewsGraphqlProviderClient session={session}>
      {children}
    </MatthewsGraphqlProviderClient>
  );
}
```

- [ ] **Step 2: Write `index.ts` (public barrel)**

Create `src/lib/matthews-graphql/index.ts`:

```ts
export { MatthewsGraphqlProvider } from "./provider";
```

Intentionally tiny — `index.ts` is the only module builders import from `@/lib/matthews-graphql` (the short form). Everything else is a subpath import (`/server`, `/route`, `/proxy`).

- [ ] **Step 3: Write `route.ts`**

Create `src/lib/matthews-graphql/route.ts`:

```ts
import { handlers } from "./server";

export const { GET, POST } = handlers;
```

- [ ] **Step 4: Write `proxy.ts` (edge-safe)**

Create `src/lib/matthews-graphql/proxy.ts`:

```ts
import NextAuth from "next-auth";
import { authConfig } from "./config";

// Edge-safe Auth.js instance for Next.js 16's proxy (ex-middleware). MUST
// NOT transitively import `./server` — that module pulls in the Okta
// provider which depends on Node-only crypto.
const { auth } = NextAuth(authConfig);

export default auth;

// NOTE: Server Functions submitted from a matcher-excluded route also bypass
// this proxy — Next.js routes them as POSTs to the host page. Authoritative
// auth checks for sensitive actions must live in the action itself (or the
// RSC that hosts the form), not here.
// Every excluded prefix ends with `(?:$|/)` so the lookahead only fires on a
// full path segment. Without the boundary, `login` would also exclude a
// future `/login-help` route from the gate, silently making it public.
export const config = {
  matcher: [
    "/((?!api/auth(?:$|/)|_next/static(?:$|/)|_next/image(?:$|/)|favicon\\.ico$|login(?:$|/)|logged-out(?:$|/)).*)",
  ],
};
```

- [ ] **Step 5: Verify build succeeds**

```bash
bun run build
```

Expected: clean exit. Still nothing outside the package imports it — this only verifies the new module compiles and its edge-safe subgraph (`proxy.ts` → `config.ts`) has no Node-only transitive imports.

- [ ] **Step 6: Commit**

```bash
git add src/lib/matthews-graphql/provider.tsx src/lib/matthews-graphql/index.ts src/lib/matthews-graphql/route.ts src/lib/matthews-graphql/proxy.ts
git commit -m "refactor(auth): add MatthewsGraphqlProvider async RSC, barrel, route, and edge-safe proxy"
```

---

## Task 7: Retarget consumer files to the new package

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/components/sign-out-button.tsx`
- Modify: `src/app/api/auth/[...nextauth]/route.ts`
- Modify: `src/proxy.ts`

- [ ] **Step 1: Rewrite `src/app/layout.tsx`**

Replace the contents of `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MatthewsGraphqlProvider } from "@/lib/matthews-graphql";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Next.js Reference Implementation",
  description: "Reference Next.js app with Okta auth and GraphQL API access",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MatthewsGraphqlProvider>{children}</MatthewsGraphqlProvider>
      </body>
    </html>
  );
}
```

Note: no longer `async`, no longer calls `auth()`. `<MatthewsGraphqlProvider>` is an async RSC that handles that internally.

- [ ] **Step 2: Update `src/app/page.tsx` imports**

Change the top of `src/app/page.tsx` from:

```ts
import { auth } from "@/auth";
import { query, PreloadQuery } from "@/lib/apollo/server";
```

to:

```ts
import { auth, query, PreloadQuery } from "@/lib/matthews-graphql/server";
```

Leave the rest of the file unchanged.

- [ ] **Step 3: Update `src/app/login/page.tsx` imports**

Change the first line from:

```ts
import { signIn } from "@/auth";
```

to:

```ts
import { signIn } from "@/lib/matthews-graphql/server";
```

- [ ] **Step 4: Update `src/components/sign-out-button.tsx` imports**

Change the first line from:

```ts
import { signOut } from "@/auth";
```

to:

```ts
import { signOut } from "@/lib/matthews-graphql/server";
```

- [ ] **Step 5: Shrink `src/app/api/auth/[...nextauth]/route.ts`**

Replace the entire contents of `src/app/api/auth/[...nextauth]/route.ts` with:

```ts
export { GET, POST } from "@/lib/matthews-graphql/route";
```

- [ ] **Step 6: Shrink `src/proxy.ts`**

Replace the entire contents of `src/proxy.ts` with:

```ts
export { default, config } from "@/lib/matthews-graphql/proxy";
```

- [ ] **Step 7: Verify build succeeds**

```bash
bun run build
```

Expected: clean exit. At this point the app is running entirely through the new package. The old files (`src/auth.ts`, `src/auth.config.ts`, `src/lib/apollo/*`, `src/components/providers.tsx`) still exist on disk but nothing outside the stale tests imports them.

- [ ] **Step 8: Run the existing test suite — should still pass**

```bash
bun run test
```

Expected: all tests pass. The four test files still target the old module paths (`./auth`, `./auth.config`, `./proxy`, `./providers`), which still exist, so coverage is intact.

- [ ] **Step 9: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx src/app/login/page.tsx src/components/sign-out-button.tsx src/app/api/auth/[...nextauth]/route.ts src/proxy.ts
git commit -m "refactor(auth): retarget consumers to matthews-graphql package"
```

---

## Task 8: Move tests to new locations with updated imports

**Files:**
- Create: `src/lib/matthews-graphql/server.test.ts` (content from `src/auth.test.ts`, imports retargeted)
- Create: `src/lib/matthews-graphql/config.test.ts` (content from `src/auth.config.test.ts`, imports retargeted, default → named)
- Create: `src/lib/matthews-graphql/proxy.test.ts` (content from `src/proxy.test.ts`, imports retargeted)
- Create: `src/lib/matthews-graphql/provider-client.test.tsx` (content from `src/components/providers.test.tsx`, imports retargeted)
- Delete: `src/auth.test.ts`
- Delete: `src/auth.config.test.ts`
- Delete: `src/proxy.test.ts`
- Delete: `src/components/providers.test.tsx`

- [ ] **Step 1: Write `src/lib/matthews-graphql/server.test.ts`**

Create `src/lib/matthews-graphql/server.test.ts` with the full content of `src/auth.test.ts`, with this one-line change — replace:

```ts
const { jwtCallback, sessionCallback, _resetRefreshCacheForTests } =
  await import("./auth");
```

with:

```ts
const { jwtCallback, sessionCallback, _resetRefreshCacheForTests } =
  await import("./server");
```

All other lines stay identical, including the `vi.mock("next-auth", ...)` and `vi.mock("next-auth/providers/okta", ...)` blocks.

- [ ] **Step 2: Write `src/lib/matthews-graphql/config.test.ts`**

Create `src/lib/matthews-graphql/config.test.ts` with the full content of `src/auth.config.test.ts`, with this one-line change — replace:

```ts
import authConfig from "./auth.config";
```

with:

```ts
import { authConfig } from "./config";
```

(Named import now, because `config.ts` uses a named export.) All other lines stay identical.

- [ ] **Step 3: Write `src/lib/matthews-graphql/proxy.test.ts`**

Create `src/lib/matthews-graphql/proxy.test.ts` with the **identical content** of the current `src/proxy.test.ts`. No edits required:

- The relative import `await import("./proxy")` still resolves to the neighboring `proxy.ts` in the new location.
- The `const appDir = join(process.cwd(), "src/app")` reference uses `process.cwd()`, which is the project root regardless of where the test file lives.

This task is purely a file move.

- [ ] **Step 4: Write `src/lib/matthews-graphql/provider-client.test.tsx`**

Create `src/lib/matthews-graphql/provider-client.test.tsx` with this content (adapted from `src/components/providers.test.tsx` — mock target and imported symbol both retargeted, assertions preserved):

```tsx
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Session } from "next-auth";

// Capture the props handed to SessionProvider so we can assert what the
// layout-level MatthewsGraphqlProviderClient is passing downstream.
// ApolloWrapper is mocked out because it depends on Apollo/SessionProvider
// runtime wiring that isn't relevant to this test.
const sessionProviderSpy = vi.fn(
  ({ children }: { children: React.ReactNode }) => <>{children}</>,
);

vi.mock("next-auth/react", () => ({
  SessionProvider: (props: Record<string, unknown>) =>
    sessionProviderSpy(props as never),
}));

vi.mock("./apollo-client", () => ({
  ApolloWrapper: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const { MatthewsGraphqlProviderClient } = await import("./provider-client");

describe("MatthewsGraphqlProviderClient", () => {
  afterEach(() => {
    cleanup();
    sessionProviderSpy.mockClear();
  });

  test("forwards the server-fetched session into SessionProvider", () => {
    const session = {
      user: { email: "u@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
      accessToken: "AT",
    } as Session;

    render(
      <MatthewsGraphqlProviderClient session={session}>
        child
      </MatthewsGraphqlProviderClient>,
    );

    expect(sessionProviderSpy).toHaveBeenCalledTimes(1);
    const props = sessionProviderSpy.mock.calls[0]![0] as { session?: Session };
    expect(props.session).toEqual(session);
  });

  test("works without a session prop for unauthenticated shells", () => {
    render(
      <MatthewsGraphqlProviderClient>child</MatthewsGraphqlProviderClient>,
    );

    expect(sessionProviderSpy).toHaveBeenCalledTimes(1);
    const props = sessionProviderSpy.mock.calls[0]![0] as { session?: Session };
    expect(props.session).toBeUndefined();
  });
});
```

- [ ] **Step 5: Delete the old test files**

```bash
rm src/auth.test.ts src/auth.config.test.ts src/proxy.test.ts src/components/providers.test.tsx
```

- [ ] **Step 6: Run the test suite — should still pass**

```bash
bun run test
```

Expected: all tests pass, now running against the new module paths. No test counts should have changed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/matthews-graphql/server.test.ts src/lib/matthews-graphql/config.test.ts src/lib/matthews-graphql/proxy.test.ts src/lib/matthews-graphql/provider-client.test.tsx src/auth.test.ts src/auth.config.test.ts src/proxy.test.ts src/components/providers.test.tsx
git commit -m "refactor(auth): move tests into matthews-graphql package"
```

Note: `git add` on deleted paths stages the deletions.

---

## Task 9: Delete old source files and verify

**Files to delete:**
- `src/auth.ts`
- `src/auth.config.ts`
- `src/lib/apollo/client.tsx`
- `src/lib/apollo/server.ts`
- `src/lib/apollo/` (empty directory)
- `src/components/providers.tsx`
- `src/types/next-auth.d.ts`
- `src/types/` (empty directory)

- [ ] **Step 1: Delete the old files and empty directories**

```bash
rm src/auth.ts src/auth.config.ts src/lib/apollo/client.tsx src/lib/apollo/server.ts src/components/providers.tsx src/types/next-auth.d.ts
rmdir src/lib/apollo src/types
```

`rmdir` fails if the directory is not empty — that's the guard. If either fails, something still references the old paths; investigate before forcing.

- [ ] **Step 2: Run the full verification suite**

```bash
bun run build
bun run test
bun run lint
```

Expected: all three pass.

If `bun run build` fails with "module not found" on one of the deleted paths, some import was missed in Task 7 — grep for the missing path:

```bash
grep -rn "@/auth\|@/lib/apollo\|@/components/providers" src/
```

Should return nothing. Fix any stragglers before proceeding.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(auth): remove old auth, apollo, and providers files"
```

`git add -A` is used here specifically to stage deletions; no new untracked files are expected at this point.

---

## Task 10: Update README and AGENTS.md

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Rewrite the "Architecture at a glance" section of README.md**

Find this block in `README.md`:

```
## Architecture at a glance

```
                ┌───────────────────┐
                │     Browser       │
                │  (Client Compo-   │
                │   nents, Apollo)  │
                └─────────┬─────────┘
                          │ session cookie
                          ▼
┌────────────────────────────────────────────┐
│ Next.js — src/proxy.ts (Auth.js gate)      │
│   unauthenticated → /login                 │
└────────────────────┬───────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
  src/app/login            src/app/page.tsx (RSC)
  (Sign in w/ Okta)        ├─ auth()  → session
                           └─ query() → Apollo RSC client
                                        └─ Bearer = session.accessToken
                                              │
                                              ▼
                                   GRAPHQL_API_URL

  OIDC callback     src/app/api/auth/[...nextauth]/route.ts
                    (exports NextAuth handlers)

  Token refresh     src/auth.ts jwt() callback hits
                    {AUTH_OKTA_ISSUER}/oauth2/v1/token when expired
```
```

Replace it with:

```
## Architecture at a glance

```
                ┌───────────────────┐
                │     Browser       │
                │  (Client Compo-   │
                │   nents, Apollo)  │
                └─────────┬─────────┘
                          │ session cookie
                          ▼
┌────────────────────────────────────────────┐
│ Next.js — src/proxy.ts (edge gate)         │
│   unauthenticated → /login                 │
└────────────────────┬───────────────────────┘
                     │
                     ▼
       ┌──────────────────────────────┐
       │ <MatthewsGraphqlProvider>    │  in src/app/layout.tsx
       │   reads session via auth()   │
       │   ├─ SessionProvider         │  next-auth/react
       │   └─ Apollo link chain       │  authLink + refreshLink + httpLink
       └──────────────┬───────────────┘
                      │
     ┌────────────────┴─────────────────┐
     ▼                                  ▼
  Server Components              Client Components
  query(), PreloadQuery()        useQuery, useMutation,
  from .../server                useSuspenseQuery
     │                                  │
     └─────────────┬────────────────────┘
                   ▼
         Bearer = session.accessToken
                   │
                   ▼
           GRAPHQL_API_URL

  All wired in: src/lib/matthews-graphql/
```

Everything auth- and GraphQL-related lives in `src/lib/matthews-graphql/`. The six files outside that directory you might touch are:

| File | What you write |
| --- | --- |
| `src/app/layout.tsx` | `<MatthewsGraphqlProvider>{children}</MatthewsGraphqlProvider>` |
| `src/app/api/auth/[...nextauth]/route.ts` | `export { GET, POST } from "@/lib/matthews-graphql/route"` |
| `src/proxy.ts` | `export { default, config } from "@/lib/matthews-graphql/proxy"` |
| Any RSC | `import { query, PreloadQuery, auth } from "@/lib/matthews-graphql/server"` |
| Any client component | `useQuery`/`useMutation` from `@apollo/client/react`, `useSession` from `next-auth/react` |
| `src/components/sign-out-button.tsx` / `src/app/login/page.tsx` | `signIn`/`signOut` from `@/lib/matthews-graphql/server` |
```

- [ ] **Step 2: Add a "Building pages and components" section to README.md**

Insert this section **immediately after** the "Architecture at a glance" section and **before** the "Prerequisites" section:

```

## Building pages and components

Add a route under `src/app/**`. Anything rendered under the root layout is
already inside `<MatthewsGraphqlProvider>`:

- **Server Components**: `import { query, PreloadQuery, auth } from "@/lib/matthews-graphql/server"` and call them directly. The Okta access token is attached to every GraphQL request.
- **Client Components**: `useQuery`, `useMutation`, `useSuspenseQuery` from `@apollo/client/react` and `useSession` from `next-auth/react`. The provider already wires them up.
- **Token refresh, 401 retry, concurrent-refresh dedup, and idle polling** are already handled inside the package. Don't re-implement them.

Don't instantiate `ApolloClient`, don't wrap your tree in `SessionProvider`, don't write custom refresh logic. If something you need isn't covered, that's a signal the package needs to change — not a reason to bypass it.

---
```

- [ ] **Step 3: Rewrite the "How the pieces connect" section of README.md**

Find the "How the pieces connect" section, starting with `## How the pieces connect`, and replace its file-by-file table with this version (keeping the Token-refresh-flow, `useMounted`, sign-out-behavior, and debug-helper subsections unchanged):

```
## How the pieces connect

Everything lives in `src/lib/matthews-graphql/`. Four public entry points:

| Subpath import | What it gives you |
| --- | --- |
| `@/lib/matthews-graphql` | `MatthewsGraphqlProvider` — the async RSC you drop into `layout.tsx` |
| `@/lib/matthews-graphql/server` | RSC Apollo (`query`, `PreloadQuery`), Auth.js runtime (`auth`, `handlers`, `signIn`, `signOut`) |
| `@/lib/matthews-graphql/route` | `GET`, `POST` for `src/app/api/auth/[...nextauth]/route.ts` |
| `@/lib/matthews-graphql/proxy` | `default` (auth handler) + `config` (matcher) for `src/proxy.ts` |

Internal files (you do not import these directly):

| File | Responsibility |
| --- | --- |
| `provider.tsx` | Async RSC; calls `auth()` and forwards session to the client wrapper |
| `provider-client.tsx` | `"use client"`; wraps SessionProvider + ApolloWrapper |
| `apollo-client.tsx` | `"use client"`; three-link chain (authLink → refreshLink → httpLink) |
| `server.ts` | Hosts the `NextAuth()` call, jwt/session callbacks, inflight-refresh dedup, and RSC `registerApolloClient` |
| `config.ts` | Edge-safe `NextAuthConfig` subset (pages + `authorized` callback). Kept split from `server.ts` because `proxy.ts` runs on the edge runtime and cannot pull in the Okta provider |
| `proxy.ts` | Edge-safe Auth.js instance for Next.js 16's proxy; exports `default` and `config.matcher` |
| `route.ts` | Re-exports `{ GET, POST }` from `handlers` for the OIDC callback route |
| `env.ts` | `requiredEnv(name)` helper that throws actionable errors for missing server env vars |
| `next-auth.d.ts` | Module augmentation: `Session.accessToken`, `Session.error`, `JWT` fields |
```

(Everything below "How the pieces connect" in README.md — "Token refresh flow", "When client components use `useMounted`", "Sign-out behavior", "Debug helpers", "Deploying", "Security notes", "Scripts", "Testing" — stays as-is.)

- [ ] **Step 4: Add guidance to AGENTS.md**

Open `AGENTS.md`. After the existing "This is NOT the Next.js you know" block, append this new section at the end of the file:

```

# Building new routes and components

Everything auth and GraphQL related lives in `src/lib/matthews-graphql/`.
When adding a page or component under `src/app/**`, trust the wrapper:

- Do **not** create new `ApolloClient` instances.
- Do **not** wrap any tree in `SessionProvider` — `<MatthewsGraphqlProvider>` already does it in the root layout.
- Do **not** implement token-refresh, 401 retry, or session polling — all three are already handled inside the package.
- For Server Components, import `query`, `PreloadQuery`, and `auth` from `@/lib/matthews-graphql/server`.
- For Client Components, use `useQuery` / `useMutation` / `useSuspenseQuery` from `@apollo/client/react` and `useSession` from `next-auth/react` — the provider above you has already wired them up.

If something you need isn't covered by the package, surface the gap (ask the user, or extend the package deliberately). Don't bypass the wrapper with ad-hoc code.
```

- [ ] **Step 5: Verify doc changes render correctly**

```bash
bun run build
```

Expected: clean exit (build doesn't render docs but confirms no accidental code changes slipped in).

Read the README and AGENTS.md files to confirm formatting is intact — link to the rendered versions isn't part of this repo's workflow, but visual sanity-check that no raw markdown syntax is broken.

- [ ] **Step 6: Commit**

```bash
git add README.md AGENTS.md
git commit -m "docs: update README and AGENTS.md for MatthewsGraphqlProvider consolidation"
```

---

## Final verification

After Task 10 is committed, run the complete verification one more time from a clean state:

```bash
bun run build
bun run test
bun run lint
```

All three must pass. Additionally, start the dev server and manually verify the golden path:

```bash
bun dev
```

Then in a browser:

1. Visit `http://localhost:3000` — confirm redirect to `/login`.
2. Sign in with Okta.
3. Confirm the home page renders with all 7 cards populated (they each exercise a different Apollo code path).
4. Open DevTools → Network — confirm GraphQL requests carry `Authorization: Bearer …`.
5. If `NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS=60` is set, wait 60 seconds and watch a token refresh happen (requests keep succeeding with a new bearer value).

If any step fails, the refactor has a behavior regression — fix before considering the plan complete.

---

## Out of scope reminder

The following are **not** part of this plan and should not be added:

- Any pluggability (config objects, extension points, callback hooks).
- Any change to the sign-out flow (stays local-only).
- Extraction to a `packages/` workspace.
- New tests beyond those moved from existing locations.
- Changes to the GraphQL example components, schema explorer, or mutation logic (beyond the required import-path retargets already listed).

Anything else that surfaces during implementation is a new request — stop and surface it, don't silently broaden the scope.
