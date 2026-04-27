# MatthewsGraphqlProvider consolidation — design

**Date:** 2026-04-22
**Status:** Approved for implementation planning
**Scope:** Refactor-only. No new functional behavior.

## Goal

Collapse the current auth (Okta) + Apollo (client + RSC) + token-refresh
setup into a single package under `src/lib/matthews-graphql/`. Builders
(including agentic tools used by non-technical authors) should be able to
add routes and components under `src/app/**` and have both auth and
GraphQL access "just work" — no instantiating clients, no writing link
chains, no wiring `SessionProvider`.

## Principles

- **Template-first, package-later.** Lives in-tree at
  `src/lib/matthews-graphql/`. Extraction to a real npm package (e.g.
  `@matthews/graphql-provider`) is a later, mechanical move operation.
- **Maximum absorption (Q2 option D).** Every file in the current auth +
  Apollo path becomes either part of the package or a 1-line re-export
  demanded by the Next.js filesystem router.
- **Strictly opinionated (Q3 option A).** Okta-only, single GraphQL
  endpoint, env-var-only configuration. No extension points, no config
  object, no callback hooks. Customization requires editing the package.
- **Idiomatic to any Next.js engineer.** Every 1-line re-export file maps
  to an already-documented Next.js/Auth.js pattern. Nothing bespoke.
- **Behaviour-preserving.** Token refresh, dedup, 401 retry, session
  polling, sign-out, proxy gating, and the RSC→CSR fallback on 401 all
  work exactly as they do today.

## Module layout

```
src/lib/matthews-graphql/
  index.ts              public barrel — exports <MatthewsGraphqlProvider> only
  provider.tsx          <MatthewsGraphqlProvider> — async RSC; calls auth()
                        internally, renders <MatthewsGraphqlProviderClient session>
  provider-client.tsx   internal "use client"; SessionProvider + ApolloWrapper
  apollo-client.ts      internal "use client"; authLink + refreshLink + httpLink
  server.ts             RSC entry: query, PreloadQuery, auth, handlers,
                        signIn, signOut. Hosts the NextAuth() call, the
                        jwt/session callbacks, the inflightRefreshes dedup,
                        and the RSC registerApolloClient.
  proxy.ts              edge-safe entry: default (auth handler) + config (matcher)
  route.ts              GET, POST (from server.ts handlers)
  config.ts             edge-safe NextAuthConfig subset: pages, authorized callback
  env.ts                server-only env reader; throws on missing required vars
  next-auth.d.ts        module augmentation: Session.accessToken, Session.error, JWT fields
```

### Public import surface

Builders only ever type one of these four forms:

| Import | Written in |
|---|---|
| `import { MatthewsGraphqlProvider } from "@/lib/matthews-graphql"` | `src/app/layout.tsx` (only) |
| `import { query, PreloadQuery, auth } from "@/lib/matthews-graphql/server"` | Any RSC |
| `export { GET, POST } from "@/lib/matthews-graphql/route"` | `src/app/api/auth/[...nextauth]/route.ts` |
| `export { default, config } from "@/lib/matthews-graphql/proxy"` | `src/proxy.ts` |

`signIn` and `signOut` are also re-exported from `/server` for the
existing login auto-submit and sign-out button. Their import paths
update from `@/auth` to `@/lib/matthews-graphql/server`.

### Why separate subpaths (not a single barrel)

Next.js enforces distinct module boundaries at the file level:

- `"use client"` must be a file-level directive; a single barrel that
  mixes server-only, client-only, and edge-safe exports triggers bundler
  errors or silent server→client leaks.
- The edge runtime used by `proxy.ts` cannot import Node-only code (the
  Okta provider pulls in `crypto`, etc.), so `proxy.ts` and `config.ts`
  must be a distinct, edge-safe subgraph that does not transitively
  import `server.ts`.

This mirrors `@apollo/client-integration-nextjs` and `next-auth`
themselves, both of which ship subpath exports for the same reasons.
Reviewers and agents pattern-match against this shape immediately.

## Data flow (unchanged)

1. **Proxy gate.** `src/proxy.ts` → `lib/matthews-graphql/proxy.ts`
   runs edge-safe `auth()` from the minimal config. Unauthenticated
   traffic redirects to `/login`. `/login` and `/logged-out` stay
   matcher-excluded.
2. **RSC render.** The root layout renders
   `<MatthewsGraphqlProvider>` (an async Server Component). It calls
   `auth()` internally (which triggers the jwt callback, refreshing the
   token if expired) and passes the session to an inner client
   component `<MatthewsGraphqlProviderClient session>`.
3. **Client hydrate.** `SessionProvider` is seeded with the
   server-fetched session, so `useSession()` returns data synchronously
   on first render. `ApolloWrapper` captures `accessToken` into a ref
   via effect; the authLink reads that ref on every outgoing request.
4. **Client 401.** `refreshLink` intercepts 401s, calls `getSession()`
   (which re-runs the jwt callback server-side), updates the ref, and
   retries once. A second 401 bubbles; the session `error` field
   surfaces to the home page.
5. **RSC 401.** The RSC Apollo client has no refresh link (matches
   today's behavior). `page.tsx` catches the throw and falls back to a
   client-only query, letting the client refreshLink rotate the token.
   This is the existing `SuspenseExampleCsr` pattern.
6. **Idle polling.** `SessionProvider` polls `/api/auth/session` every
   5 minutes (or `NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS` when set) and
   re-fetches on window focus.
7. **Refresh dedup.** `inflightRefreshes` Map (keyed on refresh token)
   coalesces concurrent refreshes so Okta's single-use refresh token
   isn't POSTed twice.

## Migration map

| Today | Tomorrow | Notes |
|---|---|---|
| `src/auth.ts` | deleted; absorbed into `lib/matthews-graphql/server.ts` | NextAuth() call, jwt/session callbacks, dedup, debug helpers all move |
| `src/auth.config.ts` | deleted; → `lib/matthews-graphql/config.ts` | Edge-safe subset; kept split from `server.ts` for proxy.ts |
| `src/proxy.ts` | kept, shrunk to 1-line re-export | Filesystem requires the file; `export { default, config } from "@/lib/matthews-graphql/proxy"` |
| `src/app/api/auth/[...nextauth]/route.ts` | kept, shrunk to 1-line re-export | Filesystem requires the file; `export { GET, POST } from "@/lib/matthews-graphql/route"` |
| `src/components/providers.tsx` | deleted | `<MatthewsGraphqlProvider>` replaces it |
| `src/lib/apollo/server.ts` | deleted | `query` / `PreloadQuery` move into `server.ts` |
| `src/lib/apollo/client.tsx` | deleted | Split into `apollo-client.ts` (link chain) + `provider-client.tsx` (SessionProvider + ApolloWrapper combined) |
| `src/types/next-auth.d.ts` | deleted | → `lib/matthews-graphql/next-auth.d.ts`; tsconfig `include` already covers `src/**` so no config change needed |
| `src/app/layout.tsx` | edited | Drops `await auth()` and `<Providers session>`; renders `<MatthewsGraphqlProvider>` directly |
| `src/app/page.tsx` | edited | Imports `query`, `PreloadQuery`, `auth` from `@/lib/matthews-graphql/server` |
| `src/components/sign-out-button.tsx` | edited | `signOut` import retargeted |
| `src/app/login/page.tsx` | edited | `signIn` import retargeted |
| `src/auth.test.ts` | moved to `src/lib/matthews-graphql/server.test.ts` | Logic unchanged |
| `src/auth.config.test.ts` | moved to `src/lib/matthews-graphql/config.test.ts` | Logic unchanged |
| `src/proxy.test.ts` | moved to `src/lib/matthews-graphql/proxy.test.ts` | Logic unchanged |
| `src/components/providers.test.tsx` | moved to `src/lib/matthews-graphql/provider.test.tsx` | Assertions retargeted at `<MatthewsGraphqlProvider>` |

## Env validation

`env.ts` (server-only, never bundled for the client):

```ts
function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[matthews-graphql] Missing required env var ${name}. See README → Local setup.`,
    );
  }
  return v;
}

export const serverEnv = {
  AUTH_OKTA_ID: required("AUTH_OKTA_ID"),
  AUTH_OKTA_ISSUER: required("AUTH_OKTA_ISSUER"),
  GRAPHQL_API_URL: required("GRAPHQL_API_URL"),
};
```

Replaces the current `process.env.AUTH_OKTA_ID!` non-null assertions,
which silently produce `undefined` at runtime when a var is missing.
Debug vars (`AUTH_DEBUG_LOG_TOKENS`,
`NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS`) stay opt-in — read inline where
used, no validation.

`env.ts` is imported only from server-runtime files (`server.ts`,
`config.ts`), so Next.js never bundles it for the client. If a
`"use client"` module ever imports it, the build fails — which is the
correct failure mode.

`NEXT_PUBLIC_GRAPHQL_API_URL` is read inside `apollo-client.ts` (the
only client-bundled module that needs it) with the same error-message
pattern. It is not routed through `env.ts` because `env.ts` must stay
server-only.

`AUTH_SECRET` is read directly by Auth.js — not wrapped here.

## Testing

All four existing unit tests move alongside their code:

- `server.test.ts` — jwt callback, refresh success/failure, dedup
- `config.test.ts` — `authorized` callback behaviour
- `proxy.test.ts` — matcher regex
- `provider.test.tsx` — `<MatthewsGraphqlProvider>` renders its children
  and wires SessionProvider + ApolloWrapper correctly

Behaviour is unchanged, so assertions stay the same — only imports
update. No new tests are in scope; `bun run test`, `bun run lint`, and
`bun run build` must all pass after the refactor.

## Documentation changes

### README.md

- **Architecture at a glance** — diagram centered on
  `<MatthewsGraphqlProvider>` as the single wrapper everything nests
  under.
- **How the pieces connect** — shrinks from today's per-file table to
  point primarily at `src/lib/matthews-graphql/` with a short
  sub-breakdown of the four entry points (`index`, `/server`, `/proxy`,
  `/route`). The edge-safe split and the reason for it stays
  documented.
- **Building pages and components** (new, near the top) —
  > Add a route under `src/app/**`. Anything rendered under the root
  > layout is already inside `<MatthewsGraphqlProvider>`:
  > `useSession()`, `useQuery`, `useSuspenseQuery`, and server-side
  > `query()` / `PreloadQuery` all work. Don't instantiate Apollo
  > clients, don't wrap your tree in `SessionProvider`, don't write
  > refresh logic — it's all in `src/lib/matthews-graphql/`.
- Token-refresh flow, sign-out behaviour, debug env, deployment, and
  security sections stay — all still accurate and load-bearing for
  future readers.

### AGENTS.md

Add a "Building new routes and components" block mirroring the README
guidance, targeted at agentic tools:

> When adding a page or component under `src/app/**`, trust the
> wrapper. Do not create new `ApolloClient` instances, do not add
> `SessionProvider`, do not implement token-refresh or 401 retry
> logic — `src/lib/matthews-graphql/` already does all of it.
>
> If something you need isn't there, the correct move is to surface
> the gap (e.g. by asking the user), not to bypass the wrapper with
> ad-hoc code.

The existing Next.js 16 deprecation warning at the top of AGENTS.md
stays.

## Out of scope

- No changes to GraphQL example components, schema explorer, or
  mutation logic beyond import-path retargeting.
- No change to sign-out behaviour (stays local-only per today's
  README).
- No extraction to a `packages/` workspace — that is the future
  library-extraction step.
- No new pluggability surface (extension points, config objects,
  callback hooks). Adding these is a separate design discussion.
- No new tests. The refactor is strictly behaviour-preserving and the
  existing suite is the correctness contract.

## Risks & mitigations

- **Risk:** Silent server→client leak through the new module graph.
  `server.ts` pulls Node-only code; accidentally importing it from a
  `"use client"` file would break the client bundle.
  **Mitigation:** Keep `"use client"` directives at the top of
  `provider-client.tsx` and `apollo-client.ts`. Keep `server.ts`
  imported only from `provider.tsx` (RSC), `route.ts`, and RSC pages.
  `bun run build` catches violations.

- **Risk:** Edge-runtime leak in `proxy.ts`. If `config.ts` grows a
  transitive import of `server.ts`, the proxy bundle fails at build.
  **Mitigation:** `config.ts` stays a pure-data `NextAuthConfig`
  literal with no provider imports. Enforced by `bun run build`, which
  compiles the edge bundle.

- **Risk:** Deleting `src/types/next-auth.d.ts` before the new location
  is picked up by TS means temporary type errors.
  **Mitigation:** Implementation plan sequences the move such that the
  new `next-auth.d.ts` lands before the old one is removed.
