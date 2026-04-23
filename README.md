# nextjs-reference-implementation

A reference implementation for teams building Next.js App Router apps that
authenticate users against Okta via OIDC, gate every route behind that
session, and call a GraphQL API via Apollo Client using the user's Okta
access token. Built with:

- **Next.js 16** (App Router, TypeScript, Turbopack, Tailwind v4)
- **Auth.js v5** (`next-auth@beta`) with the Okta provider + refresh rotation
- **Apollo Client 4** + `@apollo/client-integration-nextjs` for the
  RSC/Client-Component split
- **shadcn/ui** primitives
- **bun** as package manager / runtime

---

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
| `src/proxy.ts` | 3-line wrapper: import the handler as `proxy`, inline the `config.matcher` literal (Next.js 16 requires it) |
| Any RSC | `import { query, PreloadQuery, safeQuery, requireSession, auth } from "@/lib/matthews-graphql/server"` |
| Any client component | `useQuery`/`useMutation` from `@apollo/client/react`, `useSession` from `next-auth/react` |
| `src/components/sign-out-button.tsx` / `src/app/login/page.tsx` | `signIn`/`signOut` from `@/lib/matthews-graphql/server` |

---

## Building pages and components

Add a route under `src/app/**`. Anything rendered under the root layout is
already inside `<MatthewsGraphqlProvider>`:

- **Server Components**: `import { query, PreloadQuery, safeQuery, requireSession, auth } from "@/lib/matthews-graphql/server"` and call them directly. The Okta access token is attached to every GraphQL request. Use `requireSession()` to gate a page (redirects to `/login` on missing user or `NoRefreshToken`); use `safeQuery()` to fetch with a `{ ok, data | error }` result so a stale-token throw can fall back to a CSR component instead of crashing the page.
- **Client Components**: `useQuery`, `useMutation`, `useSuspenseQuery` from `@apollo/client/react` and `useSession` from `next-auth/react`. The provider already wires them up.
- **Token refresh, 401 retry, concurrent-refresh dedup, and idle polling** are already handled inside the package. Don't re-implement them.

Don't instantiate `ApolloClient`, don't wrap your tree in `SessionProvider`, don't write custom refresh logic. If something you need isn't covered, that's a signal the package needs to change — not a reason to bypass it.

---

## Prerequisites

- **bun** ≥ 1.2 (`curl -fsSL https://bun.sh/install | bash`)

---

## Local setup

```bash
# Install dependencies
bun install

# Generate a session-signing secret
printf "AUTH_SECRET=%s\n" "$(openssl rand -base64 33)" > .env.local

# Append the env-var template, then fill in the values below
cat .env.example >> .env.local

# Start the dev server
bun dev
```

Fill in `.env.local` with values for:

| Variable | Purpose |
| --- | --- |
| `AUTH_SECRET` | Session-signing secret (generated above). |
| `AUTH_OKTA_ID` | Okta OIDC public client ID. |
| `AUTH_OKTA_ISSUER` | Base Okta domain, e.g. `https://your-org.okta.com` — **no** `/oauth2/default` suffix. This repo uses the Org Authorization Server and hits `/oauth2/v1/token` for refresh. |
| `AUTH_TRUST_HOST` | Set to `true` behind a proxy or on non-Vercel hosts. Safe to leave `true` locally. |
| `AUTH_URL` | Fully-qualified deploy URL. Required in production; leave blank locally. |
| `GRAPHQL_API_URL` | Server-side GraphQL endpoint (used by the RSC Apollo client). Optional for first boot. |
| `NEXT_PUBLIC_GRAPHQL_API_URL` | Browser-reachable GraphQL endpoint. Often the same value. |

If you don't own the Okta tenant, ask whoever administers it for `AUTH_OKTA_ID` and `AUTH_OKTA_ISSUER`, and have them add `http://localhost:3000/api/auth/callback/okta` (and your deployed callback URL) to the app's sign-in redirect URIs.

Visit `http://localhost:3000`:

1. You are redirected to `/login` because `src/proxy.ts` has no session.
2. Click **Sign in with Okta** — Okta hosted login appears.
3. After consent you land on `/` with a greeting and the sample API query
   result.
4. Open DevTools → Network → `GRAPHQL_API_URL` request: the
   `Authorization: Bearer …` header carries the Okta access token.

---

## How the pieces connect

Everything lives in `src/lib/matthews-graphql/`. Four public entry points:

| Subpath import | What it gives you |
| --- | --- |
| `@/lib/matthews-graphql` | `MatthewsGraphqlProvider` — the async RSC you drop into `layout.tsx` |
| `@/lib/matthews-graphql/server` | RSC Apollo (`query`, `PreloadQuery`, `safeQuery`), Auth.js runtime (`auth`, `requireSession`, `handlers`, `signIn`, `signOut`) |
| `@/lib/matthews-graphql/route` | `GET`, `POST` for `src/app/api/auth/[...nextauth]/route.ts` |
| `@/lib/matthews-graphql/proxy` | Edge-safe auth handler — imported by `src/proxy.ts`, which inlines `config.matcher` (Next.js 16 static-analysis requirement) |

Internal files (you do not import these directly):

| File | Responsibility |
| --- | --- |
| `provider.tsx` | Async RSC; calls `auth()` and forwards session to the client wrapper |
| `provider-client.tsx` | `"use client"`; wraps SessionProvider + ApolloWrapper |
| `apollo-client.tsx` | `"use client"`; three-link chain (authLink → refreshLink → httpLink) |
| `server.ts` | Hosts the `NextAuth()` call, jwt/session callbacks, inflight-refresh dedup, and RSC `registerApolloClient` |
| `config.ts` | Edge-safe `NextAuthConfig` subset (pages + `authorized` callback). Kept split from `server.ts` because `proxy.ts` runs on the edge runtime and cannot pull in the Okta provider |
| `proxy.ts` | Edge-safe Auth.js instance for Next.js 16's proxy; exports `default` (the handler) — the matcher literal lives in `src/proxy.ts` |
| `route.ts` | Re-exports `{ GET, POST }` from `handlers` for the OIDC callback route |
| `env.ts` | `requiredEnv(name)` helper that throws actionable errors for missing server env vars |
| `next-auth.d.ts` | Module augmentation: `Session.accessToken`, `Session.error`, `JWT` fields |

### Token refresh flow

The `jwt` callback in `src/lib/matthews-graphql/server.ts` runs on every request that reads the session:

1. On initial sign-in Auth.js hands us the Okta `account` — we store
   `access_token`, `refresh_token`, and `expires_at` on the JWT. If
   `refresh_token` is missing we **throw** immediately; without it the
   session will silently die at first expiry. A missing refresh token almost
   always means the Okta app is missing the `Refresh Token` grant type or
   `offline_access` was not in the granted scopes.
2. On subsequent calls, if `Date.now() < expiresAt * 1000`, we return the
   token unchanged.
3. Otherwise we POST to `{AUTH_OKTA_ISSUER}/oauth2/v1/token` with
   `grant_type=refresh_token`, store the new access token (and rotated
   refresh token, if Okta returned one), and clear any prior error.
4. If the refresh call fails we mark the token with
   `error: "RefreshAccessTokenError"`; the home page shows a warning card
   and the next sign-in button click will force a fresh interactive login.

**Server-side queries** (RSC in `src/app/page.tsx` and anywhere else using
`query()` from `@/lib/matthews-graphql/server`) pick up refreshed tokens
automatically: the custom `fetch` calls `await auth()` on every request,
which runs the `jwt` callback above.

**Client-side queries** rely on three layers, in increasing urgency:

0. The root layout passes `await auth()` into `SessionProvider`, so
   `useSession()` returns the session synchronously on first render and the
   Apollo `authLink` has the access token ready before the first client
   query fires — no `/api/auth/session` round-trip on hydrate.
1. `SessionProvider` in `src/lib/matthews-graphql/provider-client.tsx` re-fetches
   `/api/auth/session` every 5 minutes (or `NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS`
   when set — see [Debug helpers](#debug-helpers)) and whenever the tab
   regains focus. Each refetch runs the `jwt` callback, so the token Apollo
   holds stays fresh while the user is actively working.
2. If a request still goes out with a just-expired token and the API
   returns **401**, the `refreshLink` in `src/lib/matthews-graphql/apollo-client.tsx`
   forces a session refresh via `getSession()` and retries the operation **once**.
   A second 401 gives up — the session's `error` field surfaces to the
   home page so the user can re-authenticate.

The `jwt` callback in `src/lib/matthews-graphql/server.ts` coalesces concurrent
refreshes of the same refresh token so that two in-flight requests don't both
POST it to Okta (which rotates the token on first use, invalidating the second
caller). See the `inflightRefreshes` map in the same file.

### When client components use `useMounted`

A few example components gate work on a `useMounted()` hook
(`src/lib/use-mounted.ts`, `useSyncExternalStore`-based). Each gate has a
specific purpose — copy the pattern when the same condition applies, not
reflexively:

| Component | Gated thing | Why |
| --- | --- | --- |
| `suspense-example-csr.tsx` | `useQuery` with `skip: !mounted` | Deliberate CSR-only fallback when the RSC `PreloadQuery` 401s. The RSC Apollo client has no refreshLink, so routing the fetch through the client Apollo lets `refreshLink` rotate the token and retry. |
| `schema-explorer.tsx` | `useQuery` with `skip: !mounted` | Defers the introspection fetch to the client so a 401 goes through the client-side `refreshLink`. |
| `mutation-example.tsx` | `<Button disabled={…}>` | Base UI serializes `disabled` differently across SSR and CSR. Rendering the button post-mount avoids the hydration mismatch. The query itself is not gated. |

If your client component makes a plain `useQuery` and doesn't need any of
the above, skip the `useMounted` gate — it costs an extra render for no
benefit.

### Sign-out behavior

Sign-out is **local-only** by design: clicking **Sign out** clears this
app's session cookie and redirects to `/logged-out`. The user's **Okta
session is untouched** — they remain signed in to Okta and to every other
Okta-backed application.

This matches the common corporate-SSO pattern (Salesforce, Slack Enterprise,
etc.): "Sign out of App X" means App X, not everything the user has open
via SSO. If the user navigates back into the app, Okta silently re-issues a
code (SSO session still valid) and they're logged back in — same behavior
as any other corporate tool.

If you need **federated logout** instead (e.g. for a kiosk/shared-machine
app), the change is: capture `id_token` in the `jwt` callback, and replace
`sign-out-button.tsx` with a server action that calls
`signOut({ redirect: false })` then `redirect()` to
`{AUTH_OKTA_ISSUER}/oauth2/v1/logout?id_token_hint=…&post_logout_redirect_uri=…`.
You'll also need to add the post-logout URL to Okta's **Sign-out redirect
URIs**. Auth.js's default `redirect` callback drops cross-origin redirects,
so use Next's `redirect()` rather than `signOut({ redirectTo })` for the
Okta URL.

### Debug helpers

Two optional env vars for local development (leave unset in production):

| Variable | Effect |
| --- | --- |
| `NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS` | Overrides the access-token expiry **and** the client-side `SessionProvider` polling interval. e.g. set to `60` to watch a refresh every minute. |
| `AUTH_DEBUG_LOG_TOKENS` | When `"true"`, logs fingerprinted (first 8 + last 8 chars) access + refresh tokens on initial sign-in and every refresh. Compare suffixes across cycles to confirm rotation. |

Refresh *failures* always log via `console.error`, regardless of
`AUTH_DEBUG_LOG_TOKENS` — they indicate a real problem worth surfacing.

---

## Deploying

- Set `AUTH_URL` to the deployed origin (e.g. `https://nextjs-reference-implementation.example.com`).
- Set `AUTH_TRUST_HOST=true` unless deploying to Vercel.
- Rotate `AUTH_SECRET` per environment and store it in your secret manager.
- `GRAPHQL_API_URL` stays server-side. Only use
  `NEXT_PUBLIC_GRAPHQL_API_URL` if the endpoint is intended to be
  reachable from the browser.

---

## Security notes

- Sessions are **JWT cookies**, HttpOnly and signed with `AUTH_SECRET`.
- Access and refresh tokens are stored on the JWT only — never rendered into
  the HTML or exposed to client code unless explicitly surfaced through
  `session.accessToken` (which Apollo uses for the Bearer header).
- CSRF is handled by Auth.js for all sign-in/sign-out POSTs.
- `src/proxy.ts` only performs an **optimistic** redirect. The authoritative
  check lives in each protected RSC via `const session = await auth()`,
  matching the Next.js 16 authentication guide.
- Sign-out is local-only — see [Sign-out behavior](#sign-out-behavior). The
  user's Okta SSO session is intentionally left alive. If you flip this to
  federated logout, audit which apps share the Okta session to ensure the
  UX matches user expectations.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `bun dev` | Start the Turbopack dev server on `:3000` |
| `bun run build` | Production build (runs typecheck + lint) |
| `bun start` | Serve the production build |
| `bun run lint` | Run ESLint |
| `bun run test` | Run the Vitest unit suite |
| `bun run test:watch` | Run Vitest in watch mode for local development |

---

## Testing

`bun run test` runs the Vitest unit suite; use `bun run test:watch` while
iterating locally. The suite covers the pure/synchronous pieces of the
stack: utility modules (`src/lib/use-mounted.ts`, `src/lib/utils.ts`), the
package's synchronous logic (edge-safe `authorized` callback, jwt/session
callbacks, refresh dedup, proxy matcher), and the client provider wrapper.
Async Server Components are out of scope for Vitest per the Next.js
guidance, and E2E coverage is out of scope for this reference app.
