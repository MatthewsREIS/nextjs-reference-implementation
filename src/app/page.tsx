import { Suspense } from "react";
import { print } from "graphql";
import {
  PreloadQuery,
  requireSession,
  safeQuery,
} from "@/lib/matthews-graphql/server";
import {
  NOTIFICATIONS_COUNT_QUERY,
  RECENT_NOTIFICATIONS_QUERY,
} from "@/graphql/examples";
import { SignOutButton } from "@/components/sign-out-button";
import { CodeBlock } from "@/components/code-block";
import { PaginationExample } from "@/components/examples/pagination-example";
import { SearchExample } from "@/components/examples/search-example";
import {
  SuspenseExample,
  SUSPENSE_VARS,
} from "@/components/examples/suspense-example";
import { SuspenseExampleCsr } from "@/components/examples/suspense-example-csr";
import { MutationExample } from "@/components/examples/mutation-example";
import { SchemaExplorer } from "@/components/examples/schema-explorer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type NotificationsCountData = {
  notifications: { totalCount: number };
};

const REFRESH_LINK_SNIPPET = `const refreshLink = new ErrorLink(({ error, operation, forward }) => {
  if (!ServerError.is(error) || error.statusCode !== 401) return;

  const ctx = operation.getContext() as { _refreshed?: boolean };
  if (ctx._refreshed) return; // already retried once — give up
  operation.setContext({ _refreshed: true });

  return rxFrom(getSession()).pipe(
    switchMap((session) => {
      tokenRef.current = session?.accessToken;
      operation.setContext((prev) => ({
        headers: {
          ...(prev.headers ?? {}),
          ...(session?.accessToken
            ? { authorization: \`Bearer \${session.accessToken}\` }
            : {}),
        },
      }));
      return forward(operation);
    }),
  );
});`;

export default async function Home() {
  // proxy.ts already gated this route; requireSession() re-checks at render
  // time and redirects to /login on a torn-down session, so the rest of the
  // page can assume session.user exists.
  const session = await requireSession();

  const countResult = await safeQuery<NotificationsCountData>({
    query: NOTIFICATIONS_COUNT_QUERY,
  });

  // PreloadQuery can't be wrapped in try/catch at the JSX level. Pre-warm the
  // server-side cache for card 4 with safeQuery; on a stale-token throw
  // (the RSC Apollo client has no refresh link) fall back to a client-only
  // useSuspenseQuery that refreshes via the client-side refreshLink.
  const preloadResult = await safeQuery({
    query: RECENT_NOTIFICATIONS_QUERY,
    variables: SUSPENSE_VARS,
  });

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Hello, {session.user.name ?? session.user.email ?? "there"}
        </h1>
        <SignOutButton />
      </div>

      {session.error && (
        <Card>
          <CardHeader>
            <CardTitle>Session warning</CardTitle>
            <CardDescription>{session.error}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>About these examples</CardTitle>
          <CardDescription>
            Each card below is a working reference for a common GraphQL
            pattern on this stack (Apollo Client 4 + Next.js App Router +
            Okta-backed bearer auth). For every card you get the{" "}
            <strong>query</strong> (or mutation) exactly as it&rsquo;s sent
            to the API, the <strong>response</strong> returned by the
            server, and a small <strong>rendered</strong> UI that consumes
            the data. Source for each example lives under{" "}
            <code>src/graphql/examples.ts</code> and{" "}
            <code>src/components/examples/</code>; copy buttons on every
            snippet make it easy to paste patterns into your own code.
            <br />
            <br />
            The API&rsquo;s public docs don&rsquo;t expose a schema
            reference, and the GraphQL endpoint is behind Okta — so the{" "}
            <strong>schema introspection</strong> card (7) is the easiest
            way to browse every type and field available. It runs the
            standard introspection query through the same authenticated
            client the rest of the app uses and prints the result as SDL.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Card 1 — RSC scalar query */}
      <Card>
        <CardHeader>
          <CardTitle>1. RSC server query</CardTitle>
          <CardDescription>
            Executed on the server via <code>query()</code> from{" "}
            <code>lib/matthews-graphql/server.ts</code>. The Okta access token
            is attached as a bearer header.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock label="Query">{print(NOTIFICATIONS_COUNT_QUERY)}</CodeBlock>
          {countResult.ok ? (
            <>
              <CodeBlock label="Response">
                {JSON.stringify(countResult.data, null, 2)}
              </CodeBlock>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rendered
              </p>
              <p className="text-sm">
                Unread notifications:{" "}
                <span className="font-mono">
                  {countResult.data?.notifications?.totalCount ?? "—"}
                </span>
              </p>
            </>
          ) : (
            <pre className="text-sm text-destructive">
              {countResult.error instanceof Error
                ? countResult.error.message
                : String(countResult.error)}
            </pre>
          )}
        </CardContent>
      </Card>

      {/* Card 2 — client useQuery + cursor pagination */}
      <Card>
        <CardHeader>
          <CardTitle>2. Client query with cursor pagination</CardTitle>
          <CardDescription>
            <code>useQuery</code> + <code>fetchMore</code>. Demonstrates the
            relay-style <code>edges &#123; node &#125;</code>,{" "}
            <code>pageInfo</code> cursors, and <code>orderBy</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaginationExample />
        </CardContent>
      </Card>

      {/* Card 3 — client useQuery + full-text search */}
      <Card>
        <CardHeader>
          <CardTitle>3. Full-text search</CardTitle>
          <CardDescription>
            <code>where: {"{ search: $query }"}</code> — the
            Meilisearch-backed search field that spans multiple indexed
            columns on the proposal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SearchExample />
        </CardContent>
      </Card>

      {/* Card 4 — PreloadQuery → useSuspenseQuery handoff */}
      <Card>
        <CardHeader>
          <CardTitle>4. PreloadQuery → useSuspenseQuery</CardTitle>
          <CardDescription>
            The server component kicks off the fetch via{" "}
            <code>PreloadQuery</code>; a client child consumes the same
            document with <code>useSuspenseQuery</code>, wrapped in a{" "}
            <code>Suspense</code> boundary. No waterfall.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock label="Query">
            {print(RECENT_NOTIFICATIONS_QUERY)}
          </CodeBlock>
          {preloadResult.ok ? (
            <PreloadQuery
              query={RECENT_NOTIFICATIONS_QUERY}
              variables={SUSPENSE_VARS}
            >
              <Suspense
                fallback={
                  <p className="text-sm text-muted-foreground">Loading…</p>
                }
              >
                <SuspenseExample />
              </Suspense>
            </PreloadQuery>
          ) : (
            <SuspenseExampleCsr />
          )}
        </CardContent>
      </Card>

      {/* Card 5 — useMutation (no-op) */}
      <Card>
        <CardHeader>
          <CardTitle>5. useMutation (no-op)</CardTitle>
          <CardDescription>
            Reads the current <code>weeklyCallCommitment</code> and writes
            the same value back. The mutation runs against the real server
            but changes nothing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MutationExample />
        </CardContent>
      </Card>

      {/* Card 6 — 401 refresh explainer (static) */}
      <Card>
        <CardHeader>
          <CardTitle>6. 401 access-token refresh</CardTitle>
          <CardDescription>
            Handled automatically by the Apollo link chain — no UI wiring
            needed. A 401 triggers <code>getSession()</code>, which runs
            the Auth.js <code>jwt</code> callback (rotating the Okta{" "}
            <code>access_token</code>), and the request is retried once
            with the new token. See <code>src/lib/matthews-graphql/apollo-client.tsx</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock>{REFRESH_LINK_SNIPPET}</CodeBlock>
        </CardContent>
      </Card>

      {/* Card 7 — Introspection rendered as SDL */}
      <Card>
        <CardHeader>
          <CardTitle>7. Schema introspection</CardTitle>
          <CardDescription>
            Runs the standard introspection query against the API, rebuilds
            a <code>GraphQLSchema</code> via <code>buildClientSchema</code>,
            and prints it as SDL with <code>printSchema</code>. Both
            helpers come from the <code>graphql</code> package.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SchemaExplorer />
        </CardContent>
      </Card>
    </main>
  );
}
