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
6. **Sign-out redirect URIs**:
   - `http://localhost:3000`
   - `https://<your-prod-host>`
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
| `src/proxy.ts` | Next.js 16 proxy (ex-`middleware.ts`). Redirects unauthenticated traffic to `/login`. |
| `src/app/api/auth/[...nextauth]/route.ts` | Re-exports `handlers.{GET,POST}` for the OIDC callback endpoint. |
| `src/lib/apollo/server.ts` | `registerApolloClient()` — per-request Apollo client for RSC. Custom `fetch` attaches the access token from `auth()`. |
| `src/lib/apollo/client.tsx` | Client-side Apollo. Three-link chain: `authLink` attaches the Okta access token, `refreshLink` catches 401s and retries once after forcing a session refresh, `httpLink` posts to the Artemis endpoint. |
| `src/components/providers.tsx` | Client wrapper: `SessionProvider` (with 5-minute polling + refetch-on-focus) + `ApolloWrapper`. |
| `src/types/next-auth.d.ts` | Augments `Session` / `JWT` with `accessToken`, `refreshToken`, `expiresAt`, `error`. |

### Token refresh flow

`src/auth.ts`'s `jwt` callback runs on every request that reads the session:

1. On initial sign-in Auth.js hands us the Okta `account` — we store
   `access_token`, `refresh_token`, and `expires_at` on the JWT.
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
   `/api/auth/session` every 5 minutes and whenever the tab regains focus.
   Each refetch runs the `jwt` callback, so the token Apollo holds stays
   fresh while the user is actively working.
2. If a request still goes out with a just-expired token and Artemis
   returns **401**, the `refreshLink` in `src/lib/apollo/client.tsx` forces
   a session refresh via `getSession()` and retries the operation **once**.
   A second 401 gives up — the session's `error` field surfaces to the
   home page so the user can re-authenticate.

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

---

## Scripts

| Command | Purpose |
| --- | --- |
| `bun dev` | Start the Turbopack dev server on `:3000` |
| `bun run build` | Production build (runs typecheck + lint) |
| `bun start` | Serve the production build |
| `bun run lint` | Run ESLint |
