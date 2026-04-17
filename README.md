# nextjs-reference-implementation

A reference implementation for internal builders: a Next.js App Router app that
authenticates users against Okta via OIDC, gates every route behind that
session, and calls the Artemis GraphQL API via Apollo Client using the user's
Okta access token. Built with:

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
                                   ARTEMIS_GRAPHQL_URL

  OIDC callback     src/app/api/auth/[...nextauth]/route.ts
                    (exports NextAuth handlers)

  Token refresh     src/auth.ts jwt() callback hits
                    {AUTH_OKTA_ISSUER}/oauth2/v1/token when expired
```

---

## Prerequisites

- **bun** ≥ 1.2 (`curl -fsSL https://bun.sh/install | bash`)
- Access to an Okta org with permission to create OIDC applications
- A reachable Artemis GraphQL endpoint (optional for first boot)

---

## Okta app setup

This repo uses a **public OIDC client** — PKCE-protected Authorization Code
flow with **no client secret**. Pick either app type in Okta:

- **Single-Page Application (SPA)**, or
- **Web Application** with **Client authentication: None** and **PKCE required**

Either works with Auth.js; both are "public clients" to OAuth.

1. Okta Admin Console → **Applications** → **Create App Integration**
2. Choose **OIDC - OpenID Connect**, then **Single-Page Application**
   (or **Web Application** — see note above).
3. **Grant types**: check **Authorization Code** and **Refresh Token**.
4. **Client authentication**: **None** (if editing a Web App).
   **Require PKCE as additional verification**: ✅ checked.
5. **Sign-in redirect URIs** — add one per environment:
   - `http://localhost:3000/api/auth/callback/okta`
   - `https://<your-prod-host>/api/auth/callback/okta`
6. **Sign-out redirect URIs**: not required for this setup — sign-out is
   local-only (see [Sign-out behavior](#sign-out-behavior)). Leave the field
   empty unless you plan to switch to federated logout.
7. **Controlled access**: assign the appropriate groups.
8. After save, copy the **Client ID** from General → Client Credentials into
   `AUTH_OKTA_ID`. There is no client secret for public clients.
9. Your `AUTH_OKTA_ISSUER` is the base Okta domain, e.g.
   `https://your-org.okta.com` — **no** `/oauth2/default` suffix. This repo
   uses the Org Authorization Server and hits `/oauth2/v1/token` for refresh.

---

## Local setup

```bash
# Install dependencies
bun install

# Generate a session-signing secret
printf "AUTH_SECRET=%s\n" "$(openssl rand -base64 33)" > .env.local

# Append the rest — edit the placeholders in .env.example, then:
cat .env.example >> .env.local   # and fill in values

# Start the dev server
bun dev
```

Visit `http://localhost:3000`:

1. You are redirected to `/login` because `src/proxy.ts` has no session.
2. Click **Sign in with Okta** — Okta hosted login appears.
3. After consent you land on `/` with a greeting and the sample Artemis query
   result.
4. Open DevTools → Network → `ARTEMIS_GRAPHQL_URL` request: the
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
| `src/lib/apollo/client.tsx` | Client-side Apollo. Three-link chain: `authLink` attaches the Okta access token, `refreshLink` catches 401s and retries once after forcing a session refresh, `httpLink` posts to the Artemis endpoint. |
| `src/components/providers.tsx` | Client wrapper: `SessionProvider` (env-driven polling interval + refetch-on-focus) + `ApolloWrapper`. |
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

**Client-side queries** rely on two layers:

1. `SessionProvider` in `src/components/providers.tsx` re-fetches
   `/api/auth/session` every 5 minutes (or `NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS`
   when set — see [Debug helpers](#debug-helpers)) and whenever the tab
   regains focus. Each refetch runs the `jwt` callback, so the token Apollo
   holds stays fresh while the user is actively working.
2. If a request still goes out with a just-expired token and Artemis
   returns **401**, the `refreshLink` in `src/lib/apollo/client.tsx` forces
   a session refresh via `getSession()` and retries the operation **once**.
   A second 401 gives up — the session's `error` field surfaces to the
   home page so the user can re-authenticate.

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
- Add the deployed callback URL to your Okta app's **Sign-in redirect URIs**.
- Rotate `AUTH_SECRET` per environment and store it in your secret manager.
- `ARTEMIS_GRAPHQL_URL` stays server-side. Only use
  `NEXT_PUBLIC_ARTEMIS_GRAPHQL_URL` if the endpoint is intended to be
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
