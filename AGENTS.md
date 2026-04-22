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
- For Server Components, import `query`, `PreloadQuery`, and `auth` from `@/lib/matthews-graphql/server`.
- For Client Components, use `useQuery` / `useMutation` / `useSuspenseQuery` from `@apollo/client/react` and `useSession` from `next-auth/react` — the provider above you has already wired them up.

If something you need isn't covered by the package, surface the gap (ask the user, or extend the package deliberately). Don't bypass the wrapper with ad-hoc code.
