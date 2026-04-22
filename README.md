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

| File | Responsibility |
| --- | --- |
| `src/auth.config.ts` | Edge-safe Auth.js config (providers `[]`, `authorized` callback, `pages`). Imported by `proxy.ts`. |
| `src/auth.ts` | Full Auth.js config: Okta provider, `jwt` callback with refresh-token rotation, `session` callback that surfaces `accessToken`. |
| `src/proxy.ts` | Next.js 16 proxy (ex-`middleware.ts`). Redirects unauthenticated traffic to `/login`; `/login` and `/logged-out` are matcher-excluded. |
| `src/app/login/page.tsx` | Auto-submits a server action on mount that calls `signIn("okta")`, so unauthenticated users land directly on Okta's hosted login (no interstitial UI). |
| `src/app/logged-out/page.tsx` | Public "you've been signed out" page. Destination of local sign-out. |
| `src/app/api/auth/[...nextauth]/route.ts` | Re-exports `handlers.{GET,POST}` for the OIDC callback endpoint. |
| `src/lib/apollo/server.ts` | `registerApolloClient()` — per-request Apollo client for RSC. Custom `fetch` attaches the access token from `auth()`. |
| `src/lib/apollo/client.tsx` | Client-side Apollo. Three-link chain: `authLink` attaches the Okta access token, `refreshLink` catches 401s and retries once after forcing a session refresh, `httpLink` posts to the API endpoint. |
| `src/components/providers.tsx` | Client wrapper: `SessionProvider` (seeded with the server-fetched session, env-driven polling interval, refetch-on-focus) + `ApolloWrapper`. |
| `src/components/sign-out-button.tsx` | Server-action form that calls `signOut({ redirectTo: "/logged-out" })` — local-only logout, Okta session untouched. |
| `src/types/next-auth.d.ts` | Augments `Session` / `JWT` with `accessToken`, `refreshToken`, `expiresAt`, `error`. |

### Token refresh flow

`src/auth.ts`'s `jwt` callback runs on every request that reads the session:

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
`query()` from `src/lib/apollo/server.ts`) pick up refreshed tokens
automatically: the custom `fetch` calls `await auth()` on every request,
which runs the `jwt` callback above.

**Client-side queries** rely on three layers, in increasing urgency:

0. The root layout passes `await auth()` into `SessionProvider`, so
   `useSession()` returns the session synchronously on first render and the
   Apollo `authLink` has the access token ready before the first client
   query fires — no `/api/auth/session` round-trip on hydrate.
1. `SessionProvider` in `src/components/providers.tsx` re-fetches
   `/api/auth/session` every 5 minutes (or `NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS`
   when set — see [Debug helpers](#debug-helpers)) and whenever the tab
   regains focus. Each refetch runs the `jwt` callback, so the token Apollo
   holds stays fresh while the user is actively working.
2. If a request still goes out with a just-expired token and the API
   returns **401**, the `refreshLink` in `src/lib/apollo/client.tsx` forces
   a session refresh via `getSession()` and retries the operation **once**.
   A second 401 gives up — the session's `error` field surfaces to the
   home page so the user can re-authenticate.

The `jwt` callback in `src/auth.ts` coalesces concurrent refreshes of the
same refresh token so that two in-flight requests don't both POST it to
Okta (which rotates the token on first use, invalidating the second
caller). See the `inflightRefreshes` map in `src/auth.ts`.

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
iterating locally. Scope is intentionally limited to pure, synchronous
modules (`src/lib/use-mounted.ts`, `src/lib/utils.ts`) — async Server
Components are out of scope for Vitest per the Next.js guidance, and E2E
coverage is out of scope for this reference app.
