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
  // `apollo-client`, `provider-client`, `config`, or `env` from outside the
  // package bypasses the wrapper and invites silent auth/refresh bugs (an
  // agent might recreate ApolloClient, re-wrap SessionProvider, or skip
  // token coalescing). Enforce the boundary at lint time.
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
                "@/lib/matthews-graphql/provider-client",
                "@/lib/matthews-graphql/config",
                "@/lib/matthews-graphql/env",
              ],
              message:
                "Package-internal module. Import from `@/lib/matthews-graphql/{provider,server,safe-preload,csr-query-fallback,proxy}` instead.",
            },
          ],
        },
      ],
    },
  },
  {
    // The package itself may wire up its own internals freely.
    files: ["src/lib/matthews-graphql/**"],
    rules: { "no-restricted-imports": "off" },
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
