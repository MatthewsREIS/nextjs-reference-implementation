<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Building new routes and components

Everything auth and GraphQL related lives in `src/lib/matthews-graphql/`.
When adding a page or component under `src/app/**`, trust the wrapper:

- Do **not** create new `ApolloClient` instances.
- Do **not** wrap any tree in `SessionProvider` — `<MatthewsGraphqlProvider>` already does it in the root layout.
- Do **not** implement token-refresh, 401 retry, or session polling — all three are already handled inside the package.
- For Server Components, import `query`, `PreloadQuery`, `safeQuery`, `requireSession`, and `auth` from `@/lib/matthews-graphql/server`.
- For Client Components, use `useQuery` / `useMutation` / `useSuspenseQuery` from `@apollo/client/react` and `useSession` from `next-auth/react` — the provider above you has already wired them up.

## Server-side helpers

- `requireSession()` — returns the session, or redirects to `/login` if there's no user or `session.error === "NoRefreshToken"`. Use this instead of hand-rolling `auth()` + null check + redirect. A `RefreshAccessTokenError` is recoverable on the next request, so it returns the session with the error set — render a warning if you want to surface it.
- `safeQuery({ query, variables })` — wraps `query()` and returns `{ ok: true, data }` or `{ ok: false, error }`. Use this for RSC fetches: the RSC Apollo client has no refresh link, so a stale access token throws. On `ok: false`, fall back to a client component that uses `useQuery` / `useSuspenseQuery` (those DO refresh on 401).
- `PreloadQuery` cannot be wrapped in try/catch at the JSX level. Pre-warm with `safeQuery` first; if it fails, render the CSR fallback instead of `PreloadQuery`. See `src/app/page.tsx` Card 4 for the full RSC→CSR recipe.

## Client Components

- **Default:** plain `useQuery` / `useMutation` / `useSuspenseQuery`. The client Apollo's `refreshLink` heals stale-token 401s transparently — do **not** gate queries on `useMounted` reflexively.
- There are only two legitimate reasons to use `useMounted` + `skip: !mounted`:
  1. **CSR fallback after an RSC `PreloadQuery` 401.** RSC Apollo has no refresh link, so routing the fetch through the client Apollo is the only way to heal the token. This is Card 4's whole point. Reference: `src/app/_components/suspense-example-csr.tsx`.
  2. **Hydration-sensitive UI** (e.g. a Base UI `<Button disabled>` that serializes differently SSR vs CSR). Gate the **UI**, not the query. Reference: `src/app/_components/mutation-example.tsx`.
- If neither applies, skip `useMounted` — it costs an extra render for nothing.

## Server context coverage

- **Server Actions** and **Route Handlers** (`route.ts` under `/api`) are server context — import `auth`, `query`, `PreloadQuery`, `safeQuery`, `requireSession` from `/server` exactly as you would in an RSC.
- **Edge runtime** (`export const runtime = "edge"`) is **not** covered by `/server`: the RSC Apollo client and the NextAuth instance use Node-only code. The only edge-safe export is `@/lib/matthews-graphql/proxy`, which is wired through `src/proxy.ts`. Don't import `/server` from an edge handler.

If something you need isn't covered by the package, surface the gap (ask the user, or extend the package deliberately). Don't bypass the wrapper with ad-hoc code.
