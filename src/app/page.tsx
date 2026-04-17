import { Suspense } from "react";
import { print } from "graphql";
import { auth } from "@/auth";
import { query, PreloadQuery } from "@/lib/apollo/server";
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
import { MutationExample } from "@/components/examples/mutation-example";
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
  // proxy.ts has already gated this route, but re-check here to satisfy
  // Next.js' recommendation to treat session auth as a page-level concern.
  const session = await auth();

  const { data: countData, error: countError } = await query<
    NotificationsCountData
  >({
    query: NOTIFICATIONS_COUNT_QUERY,
  }).catch((err: unknown) => ({ data: null, error: err }));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Hello, {session?.user?.name ?? session?.user?.email ?? "there"}
        </h1>
        <SignOutButton />
      </div>

      {session?.error && (
        <Card>
          <CardHeader>
            <CardTitle>Session warning</CardTitle>
            <CardDescription>{session.error}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Card 1 — RSC scalar query */}
      <Card>
        <CardHeader>
          <CardTitle>1. RSC server query</CardTitle>
          <CardDescription>
            Executed on the server via <code>query()</code> from{" "}
            <code>lib/apollo/server.ts</code>. The Okta access token is
            attached as a bearer header.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock>{print(NOTIFICATIONS_COUNT_QUERY)}</CodeBlock>
          {countError ? (
            <pre className="text-sm text-destructive">
              {countError instanceof Error
                ? countError.message
                : String(countError)}
            </pre>
          ) : (
            <>
              <p className="text-sm">
                Unread notifications:{" "}
                <span className="font-mono">
                  {countData?.notifications?.totalCount ?? "—"}
                </span>
              </p>
              <CodeBlock>{JSON.stringify(countData, null, 2)}</CodeBlock>
            </>
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

      {/* Card 3 — client useQuery + search + edge filter + or */}
      <Card>
        <CardHeader>
          <CardTitle>
            3. Search with edge filtering and <code>or</code>
          </CardTitle>
          <CardDescription>
            Matches proposals whose name contains the query{" "}
            <em>or</em> whose client full-name contains it. The{" "}
            <code>hasClientWith</code> clause is the edge-filter pattern.
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
        <CardContent>
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
            with the new token. See{" "}
            <code>src/lib/apollo/client.tsx</code> lines 47–68.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock>{REFRESH_LINK_SNIPPET}</CodeBlock>
        </CardContent>
      </Card>
    </main>
  );
}
