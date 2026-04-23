import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactCompiler from "eslint-plugin-react-compiler";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { "react-compiler": reactCompiler },
    rules: { "react-compiler/react-compiler": "error" },
  },
  // Package-internal modules of `src/lib/matthews-graphql/` are not part of
  // the public surface — the exported barrels are `./provider`, `./server`,
  // `./safe-preload`, `./csr-query-fallback`, and `./proxy`. Deep-importing
  // `apollo-client`, `provider`, `provider-client`, `config`, or `env` from
  // outside the package bypasses the wrapper and invites silent auth/refresh
  // bugs (an agent might recreate ApolloClient, re-wrap SessionProvider, or
  // skip token coalescing). Enforce the boundary at lint time.
  //
  // Additionally fence the two most common reflex anti-patterns documented in
  // AGENTS.md: instantiating a fresh `ApolloClient` (bypasses the
  // authLink → refreshLink → httpLink chain) or nesting a second
  // `SessionProvider` (doubles `/api/auth/session` polling). The type imports
  // `ApolloClient` (the type, imported via `import type`) and the React
  // provider `ApolloProvider` are intentionally not blocked — they're valid
  // consumer surface; only the runtime `ApolloClient` class constructor is.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@apollo/client",
              importNames: ["ApolloClient"],
              message:
                "Don't instantiate a fresh ApolloClient — it bypasses the auth/refresh link chain. Use `useQuery`/`useMutation`/`useSuspenseQuery` from `@apollo/client/react`, or `query`/`PreloadQuery`/`safeQuery` from `@/lib/matthews-graphql/server`.",
            },
            {
              name: "next-auth/react",
              importNames: ["SessionProvider"],
              message:
                "Don't wrap a subtree in a second SessionProvider — `<MatthewsGraphqlProvider>` already installs one at the root layout. Use `useSession` from `next-auth/react` for session metadata.",
            },
          ],
          patterns: [
            {
              group: [
                "@/lib/matthews-graphql/apollo-client",
                "@/lib/matthews-graphql/internal-variables",
                "@/lib/matthews-graphql/provider",
                "@/lib/matthews-graphql/provider-client",
                "@/lib/matthews-graphql/config",
                "@/lib/matthews-graphql/env",
              ],
              message:
                "Package-internal module. Import `MatthewsGraphqlProvider` from `@/lib/matthews-graphql` and everything else from `@/lib/matthews-graphql/{server,safe-preload,csr-query-fallback,proxy}`.",
            },
          ],
        },
      ],
      // Fence the two silent anti-patterns that aren't caught by
      // no-restricted-imports (see AGENTS.md § silent anti-patterns 3 & 4):
      //
      //   - Reading an access token off `useSession()` in application code.
      //     The only legitimate consumer is the package itself (apollo-client's
      //     authLink/refreshLink); anywhere else it's the precursor to a
      //     hand-rolled fetch with a stale Bearer header.
      //
      //   - Setting an `Authorization: \`Bearer ${...}\`` header from a
      //     template literal. The package builds these headers internally in
      //     server.ts's RSC fetch and apollo-client.tsx's authLink; anywhere
      //     else means the caller is bypassing the refresh link chain.
      //
      // The package itself legitimately does both; its override below turns
      // these rules off for files under `src/lib/matthews-graphql/`.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.type='Identifier'][property.name='accessToken']",
          message:
            "Don't read `accessToken` from the session. Apollo's link chain (both RSC and CSR) already attaches the Bearer header and refreshes the token on 401 — use `useQuery`/`useMutation`/`useSuspenseQuery` or `query`/`safeQuery`/`PreloadQuery` from `@/lib/matthews-graphql/server`. If you need `useSession`, use it only for user metadata (`name`, `email`, `session.error`).",
        },
        {
          // Catch the destructure form: `const { accessToken } = session`
          // and `const { accessToken: t } = session`. Same reasoning as the
          // MemberExpression rule above.
          selector:
            "ObjectPattern > Property[key.type='Identifier'][key.name='accessToken']",
          message:
            "Don't destructure `accessToken` from the session. Apollo's link chain (both RSC and CSR) already attaches the Bearer header and refreshes the token on 401 — use `useQuery`/`useMutation`/`useSuspenseQuery` or `query`/`safeQuery`/`PreloadQuery` from `@/lib/matthews-graphql/server`. If you need `useSession`, use it only for user metadata (`name`, `email`, `session.error`).",
        },
        {
          selector:
            "Property:matches([key.name='Authorization'],[key.name='authorization'],[key.value='Authorization'],[key.value='authorization']) > TemplateLiteral",
          message:
            "Don't build an `Authorization: Bearer …` header in application code. Apollo's link chain attaches it automatically and refreshes on 401; a hand-rolled header has no refresh and breaks silently when the token expires. For a truly non-GraphQL authenticated service, stop and ask — no `fetchWithAuth` helper exists yet.",
        },
        {
          // `<SafePreload>` and `<CsrQueryFallback>` take `Renderer` and
          // `ErrorComponent` as *component references* (imported identifiers),
          // not inline closures. The RSC→client serialization boundary rejects
          // closures with "Functions cannot be passed directly to Client
          // Components." The JSDoc on those props says so, but the mistake is
          // runtime-only without this rule. Inline arrow / function expression
          // in the JSX attribute value becomes a lint error.
          selector:
            "JSXOpeningElement[name.name=/^(SafePreload|CsrQueryFallback)$/] > JSXAttribute[name.name=/^(Renderer|ErrorComponent)$/] > JSXExpressionContainer > :matches(ArrowFunctionExpression, FunctionExpression)",
          message:
            "`Renderer` and `ErrorComponent` must be component references (imported identifiers), not inline closures. RSC→client serialization rejects closures with 'Functions cannot be passed directly to Client Components.' Define the component at module scope and pass its identifier.",
        },
      ],
    },
  },
  {
    // The package itself may wire up its own internals freely.
    files: ["src/lib/matthews-graphql/**"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-syntax": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
