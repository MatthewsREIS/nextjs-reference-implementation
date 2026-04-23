<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Before you set `runtime = "edge"`, read this

The `@/lib/matthews-graphql/server` barrel (`auth`, `query`, `PreloadQuery`, `safeQuery`, `requireSession`) and the `@/lib/matthews-graphql/safe-preload` and `@/lib/matthews-graphql/csr-query-fallback` barrels all use Node-only code (the RSC Apollo client and the NextAuth instance). Importing any of them from a route or component that sets `export const runtime = "edge"` throws at module load — on purpose. **The only edge-safe export is `@/lib/matthews-graphql/proxy`**, wired through `src/proxy.ts`. If you need session data on the edge, use the proxy — don't import `/server`, `/safe-preload`, or `/csr-query-fallback`. See `src/proxy.ts` for the canonical example.

# Building new routes and components

Everything auth and GraphQL related lives in `src/lib/matthews-graphql/`.
When adding a page or component under `src/app/**`, trust the wrapper:

- Do **not** create new `ApolloClient` instances.
- Do **not** wrap any tree in `SessionProvider` — `<MatthewsGraphqlProvider>` already does it in the root layout.
- Do **not** implement token-refresh, 401 retry, or session polling — all three are already handled inside the package.
- For Server Components, import `query`, `PreloadQuery`, `safeQuery`, `requireSession`, and `auth` from `@/lib/matthews-graphql/server`. `SafePreload` lives in its own barrel, `@/lib/matthews-graphql/safe-preload` (and its client partner `CsrQueryFallback` in `@/lib/matthews-graphql/csr-query-fallback`).
- For Client Components, use `useQuery` / `useMutation` / `useSuspenseQuery` from `@apollo/client/react` — the provider above you has already wired them up. Only reach for `useSession` from `next-auth/react` when you need session metadata directly (the user's name/email, `session.error`); never to pull the access token for a hand-rolled `fetch`.

## Server-side helpers

- `requireSession()` — returns the session, or redirects to `/login` if there's no user or `session.error === "NoRefreshToken"`. Use this instead of hand-rolling `auth()` + null check + redirect. A `RefreshAccessTokenError` is recoverable on the next request, so it returns the session with the error set — render a warning if you want to surface it.
- `safeQuery({ query, variables })` — wraps `query()` and returns `{ ok: true, data }` or `{ ok: false, error }`. Use this for RSC fetches. The RSC Apollo client already refreshes pre-emptively — its custom `fetch` calls `await auth()` on every request, which re-runs the `jwt` callback — so most stale-token cases heal automatically. `safeQuery` catches the residual case: a session whose previous refresh already failed (`session.error === "RefreshAccessTokenError"`) where the cached access token is now rejected by the API. `requireSession()` intentionally passes those sessions through, so the RSC still renders and the query still fires with a stale token. On `ok: false`, fall back to a client component — the client Apollo has a response-level `ErrorLink` that re-fetches the session and retries, recovering those sessions on the next client interaction. (`data` is narrowed to `TData` on the `ok: true` branch — a malformed upstream response that would return `data: undefined` throws from `safeQuery` instead of leaking into the ok branch.) See `src/app/page.tsx` Card 4 for a `SafePreload` example.
- `SafePreload` — the drop-in for `PreloadQuery`. Pre-warms the cache with `safeQuery`, renders a `<Suspense>`-wrapped consumer on `ok`, and falls back to `<CsrQueryFallback>` on a stale-token 401. You author one `Renderer`, one `ErrorComponent`, and one `loading` node — the wrapper wires both branches. Usage:
  ```tsx
  <SafePreload
    query={MY_QUERY}
    variables={vars}
    loading={<MyLoading />}
    ErrorComponent={MyErrorComponent}
    Renderer={MyRenderer}
  />
  ```
  `MyRenderer` is a client component that receives `{ data }` — the same component renders both the preloaded (RSC→CSR) and the fallback (CSR retry) paths, so the two branches can't drift. `ErrorComponent` and `Renderer` are **component references** (imported identifiers), not inline closures — closures would fail at the RSC→client serialization boundary with "Functions cannot be passed directly to Client Components." Reference: `src/app/page.tsx` Card 4.
- `CsrQueryFallback` — the client partner used inside `SafePreload`. You normally won't reach for it directly; use `SafePreload` unless you need to build a CSR-only fallback without a preloaded RSC path. It mount-gates a `useQuery` so the fetch runs under the client Apollo's `ErrorLink`, which re-fetches the session and retries. The mount gate here is load-bearing (see the `useMounted` notes below); **do not copy the pattern elsewhere**.
- Raw `PreloadQuery` is still exported from `/server` for advanced uses, but default to `SafePreload` — it's the one an agent should reach for.

## Client Components

- **Default:** plain `useQuery` / `useMutation` / `useSuspenseQuery`. The client Apollo's `refreshLink` heals stale-token 401s transparently — do **not** gate queries on `useMounted` reflexively.
- There are only two legitimate reasons to use `useMounted` + `skip: !mounted`:
  1. **Inside `CsrQueryFallback`** — that primitive is the blessed way to do this. Do not hand-roll the mount-gate yourself. Reference: `src/lib/matthews-graphql/csr-query-fallback.tsx`.
  2. **Hydration-sensitive UI** (e.g. a Base UI `<Button disabled>` that serializes differently SSR vs CSR). Gate the **UI**, not the query. Reference: `src/components/examples/mutation-example.tsx`.
- If neither applies, skip `useMounted` — it costs an extra render for nothing.

## Server context coverage

- **RSC pages and layouts** — import `auth`, `query`, `PreloadQuery`, `safeQuery`, `requireSession` from `/server`, plus `SafePreload` from `/safe-preload` if you're preloading for a Suspense consumer. This is the context that can render a CSR fallback, so `safeQuery` / `SafePreload` are the right default for a page whose data fetch could 401 on a stale token.
- **Server Actions** and **Route Handlers** (`route.ts` under `/api`) are server context, but they **don't have a render plane** — an action returns data or redirects, and a route handler returns a `Response`. Use `auth` / `requireSession` for the session check, and **`query` (not `safeQuery`)** for GraphQL calls. `safeQuery`'s `ok: false` branch is designed for an RSC that wants to hand off to `<CsrQueryFallback>`; there's no equivalent fallback plane inside an action or route handler, so let `query` throw and let the caller (or Next's error boundary, for actions that return to a page) surface it. Don't reach for `SafePreload` / `CsrQueryFallback` here either — they're RSC→CSR primitives.
- **Edge runtime** is a separate world — see the callout at the top of this document. Don't import `/server`, `/safe-preload`, or `/csr-query-fallback` from an edge handler; use `@/lib/matthews-graphql/proxy`.

If something you need isn't covered by the package, surface the gap (ask the user, or extend the package deliberately). Don't bypass the wrapper with ad-hoc code.

# Don't do this — silent anti-patterns

The four patterns below are what an agent reaches for by reflex when they skip the helpers above. Three of the four fail **silently** — tests pass, TypeScript is quiet, runtime looks fine — until a refresh edge case manifests in production. Treat each as a bug.

1. **`new ApolloClient(...)` in a client component.** Bypasses the `authLink → refreshLink → httpLink` chain entirely. Token refresh silently no-ops; the component sees 401s it can't explain. Use `useQuery` / `useMutation` / `useSuspenseQuery` from `@apollo/client/react` — the client above has already wired a configured client into context.

2. **A second `<SessionProvider>` wrapping a subtree.** `next-auth` tolerates the nesting, but the inner provider re-fetches independently and doubles `/api/auth/session` polls. Won't break, won't be caught by tests, just wastes requests. The root layout already installs one.

3. **Hand-rolled refresh on top of `useSession`.** Conflicts with `refreshLink`'s single-retry guarantee and with the refresh-token coalescing in `src/lib/matthews-graphql/server.ts` (see the `inflightRefreshes` map — Okta rotates the refresh token on first use, so parallel refreshes would invalidate each other). If you think you need this, the answer is no — file a bug against the package instead.

4. **Raw `fetch(GRAPHQL_URL, { headers: { Authorization: \`Bearer ${session.accessToken}\` }})`.** Works once, then breaks when the access token expires — no `refreshLink`, no retry. Agents reach for this pattern when writing a non-Apollo HTTP call to the GraphQL API; don't. For a truly non-GraphQL authenticated HTTP call to some *other* service, stop and ask — no `fetchWithAuth` helper exists yet and the correct abstraction depends on which service.

If you're about to write any of the four, the root cause is almost always "I didn't know `matthews-graphql` handles that." Re-read the sections above.
