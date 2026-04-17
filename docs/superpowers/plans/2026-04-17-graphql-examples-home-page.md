# GraphQL Examples Home Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home page's single placeholder query with six reference cards that demonstrate the core GraphQL patterns on this stack: RSC query, client pagination, search with edge filtering, `PreloadQuery` handoff, a no-op mutation, and a static 401-refresh explainer.

**Architecture:** Each card shows its `gql` source (via `print(DocumentNode)`) next to live output from the API endpoint. Server-side examples live in `src/app/page.tsx`; interactive ones are `"use client"` components under `src/components/examples/`. All queries and the mutation live in `src/graphql/examples.ts`.

**Tech Stack:** Next.js 16 App Router, Apollo Client 4 (`@apollo/client`, `@apollo/client-integration-nextjs`), shadcn/Card, Tailwind, `graphql.print` for source rendering.

**Verification strategy:** This repo has no test infrastructure (confirmed — no jest/vitest/playwright in `package.json`), and the spec explicitly scopes tests out. Each task verifies with `bun run build` (type + compile check), ESLint via `bun run lint`, and browser eyeballing. Frequent commits after each task.

---

## File layout

**New files:**
- `src/graphql/examples.ts` — all `gql` documents
- `src/components/code-block.tsx` — `<pre>` wrapper
- `src/components/examples/pagination-example.tsx`
- `src/components/examples/search-example.tsx`
- `src/components/examples/suspense-example.tsx`
- `src/components/examples/mutation-example.tsx`

**Modified:**
- `src/app/page.tsx` — composes all six cards

**Deleted:**
- `src/graphql/example.ts`

---

## Task 1: Shared building blocks (`CodeBlock` + `examples.ts`)

**Files:**
- Create: `src/components/code-block.tsx`
- Create: `src/graphql/examples.ts`
- Delete: `src/graphql/example.ts`

- [ ] **Step 1: Create `src/components/code-block.tsx`**

```tsx
import { cn } from "@/lib/utils";

export function CodeBlock({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed",
        className,
      )}
    >
      <code>{children}</code>
    </pre>
  );
}
```

- [ ] **Step 2: Create `src/graphql/examples.ts`**

```ts
import { gql } from "@apollo/client";

// --- Card 1: RSC scalar query with `where` ---
export const NOTIFICATIONS_COUNT_QUERY = gql`
  query NotificationsCount {
    notifications(where: { read: false }) {
      totalCount
    }
  }
`;

// --- Cards 2 and 4: cursor pagination + orderBy ---
// Reused: card 2 fetches via useQuery with fetchMore; card 4 is preloaded
// server-side and consumed via useSuspenseQuery.
export const RECENT_NOTIFICATIONS_QUERY = gql`
  query RecentNotifications($first: Int!, $after: Cursor, $read: Boolean!) {
    notifications(
      first: $first
      after: $after
      where: { read: $read }
      orderBy: { direction: DESC, field: CREATED_AT }
    ) {
      edges {
        node {
          id
          createdAt
          read
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

// --- Card 3: search + edge filter + or-composition ---
export const SEARCH_PROPOSALS_QUERY = gql`
  query SearchProposals($query: String!) {
    proposals(
      where: {
        or: [
          { nameContainsFold: $query }
          { hasClientWith: [{ fullNameContainsFold: $query }] }
        ]
      }
      first: 10
    ) {
      edges {
        node {
          id
          name
          client {
            id
            fullName
          }
        }
      }
    }
  }
`;

// --- Card 5: read current value + no-op mutation ---
// The mutation writes the value back unchanged.
export const WEEKLY_CALL_COMMITMENT_QUERY = gql`
  query WeeklyCallCommitment {
    viewer {
      id
      weeklyCallCommitment
    }
  }
`;

export const UPDATE_COMMITMENTS_NOOP_MUTATION = gql`
  mutation UpdateCommitmentsNoOp($weeklyCallCommitment: Int!) {
    UpdateUserSettings(
      input: { weeklyCallCommitment: $weeklyCallCommitment }
    ) {
      weeklyCallCommitment
    }
  }
`;
```

- [ ] **Step 3: Delete `src/graphql/example.ts`**

```bash
rm src/graphql/example.ts
```

- [ ] **Step 4: Verify typecheck/build still passes**

Run: `bun run build`
Expected: Build fails because `src/app/page.tsx` still imports from the deleted `./graphql/example`. This is expected — Task 6 rewrites `page.tsx`. Proceed to the next task.

If `bun run build` errors in any file _other than_ `src/app/page.tsx`, stop and investigate.

- [ ] **Step 5: Commit**

```bash
git add src/components/code-block.tsx src/graphql/examples.ts src/graphql/example.ts
git commit -m "feat: scaffold CodeBlock + GraphQL example documents"
```

---

## Task 2: Pagination example client component

**Files:**
- Create: `src/components/examples/pagination-example.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useQuery } from "@apollo/client";
import { print } from "graphql";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";
import { RECENT_NOTIFICATIONS_QUERY } from "@/graphql/examples";

const PAGE_SIZE = 5;

export function PaginationExample() {
  const { data, loading, error, fetchMore } = useQuery(
    RECENT_NOTIFICATIONS_QUERY,
    { variables: { first: PAGE_SIZE, read: false, after: null } },
  );

  const edges = data?.notifications?.edges ?? [];
  const pageInfo = data?.notifications?.pageInfo;

  return (
    <div className="space-y-3">
      <CodeBlock>{print(RECENT_NOTIFICATIONS_QUERY)}</CodeBlock>

      {error && (
        <pre className="text-sm text-destructive">{error.message}</pre>
      )}

      {loading && edges.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : edges.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No unread notifications.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {edges.map(
            (edge: {
              node: { id: string; createdAt: string; read: boolean };
            }) => (
              <li key={edge.node.id} className="font-mono text-xs">
                {edge.node.createdAt} — {edge.node.id}
              </li>
            ),
          )}
        </ul>
      )}

      {pageInfo?.hasNextPage && (
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() =>
            fetchMore({
              variables: { after: pageInfo.endCursor },
              updateQuery: (prev, { fetchMoreResult }) => {
                if (!fetchMoreResult) return prev;
                return {
                  ...fetchMoreResult,
                  notifications: {
                    ...fetchMoreResult.notifications,
                    edges: [
                      ...prev.notifications.edges,
                      ...fetchMoreResult.notifications.edges,
                    ],
                  },
                };
              },
            })
          }
        >
          Load more
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/examples/pagination-example.tsx
git commit -m "feat: add pagination + fetchMore example component"
```

---

## Task 3: Search example client component

**Files:**
- Create: `src/components/examples/search-example.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@apollo/client";
import { print } from "graphql";
import { CodeBlock } from "@/components/code-block";
import { SEARCH_PROPOSALS_QUERY } from "@/graphql/examples";

export function SearchExample() {
  const [query, setQuery] = useState("");
  const skip = query.trim().length < 2;

  const { data, loading, error } = useQuery(SEARCH_PROPOSALS_QUERY, {
    variables: { query },
    skip,
  });

  const edges = data?.proposals?.edges ?? [];

  return (
    <div className="space-y-3">
      <CodeBlock>{print(SEARCH_PROPOSALS_QUERY)}</CodeBlock>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search proposals (min 2 chars)…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />

      {error && (
        <pre className="text-sm text-destructive">{error.message}</pre>
      )}

      {skip ? (
        <p className="text-sm text-muted-foreground">
          Type at least 2 characters to search.
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Searching…</p>
      ) : edges.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matches.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {edges.map(
            (edge: {
              node: {
                id: string;
                name: string;
                client: { fullName: string } | null;
              };
            }) => (
              <li key={edge.node.id}>
                <span className="font-medium">{edge.node.name}</span>
                {edge.node.client && (
                  <span className="text-muted-foreground">
                    {" "}
                    — {edge.node.client.fullName}
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/examples/search-example.tsx
git commit -m "feat: add search example with edge filter + or composition"
```

---

## Task 4: Suspense example client component

**Files:**
- Create: `src/components/examples/suspense-example.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useSuspenseQuery } from "@apollo/client";
import { RECENT_NOTIFICATIONS_QUERY } from "@/graphql/examples";

// Variables MUST match the <PreloadQuery> call in page.tsx so the client
// re-reads from the preloaded cache instead of issuing a fresh request.
export const SUSPENSE_VARS = { first: 3, after: null, read: false };

export function SuspenseExample() {
  const { data } = useSuspenseQuery(
    RECENT_NOTIFICATIONS_QUERY,
    { variables: SUSPENSE_VARS },
  );

  const edges = data?.notifications?.edges ?? [];

  if (edges.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No unread notifications.
      </p>
    );
  }

  return (
    <ul className="space-y-1 text-sm">
      {edges.map(
        (edge: {
          node: { id: string; createdAt: string };
        }) => (
          <li key={edge.node.id} className="font-mono text-xs">
            {edge.node.createdAt} — {edge.node.id}
          </li>
        ),
      )}
    </ul>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/examples/suspense-example.tsx
git commit -m "feat: add useSuspenseQuery client consumer"
```

---

## Task 5: Mutation (no-op) example client component

**Files:**
- Create: `src/components/examples/mutation-example.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useMutation, useQuery } from "@apollo/client";
import { print } from "graphql";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";
import {
  UPDATE_COMMITMENTS_NOOP_MUTATION,
  WEEKLY_CALL_COMMITMENT_QUERY,
} from "@/graphql/examples";

export function MutationExample() {
  const { data, loading: queryLoading, error: queryError } = useQuery(
    WEEKLY_CALL_COMMITMENT_QUERY,
  );

  const [runMutation, { loading: mutating, error: mutationError, data: mutationData }] =
    useMutation(UPDATE_COMMITMENTS_NOOP_MUTATION);

  const current = data?.viewer?.weeklyCallCommitment ?? null;

  return (
    <div className="space-y-3">
      <CodeBlock>{print(UPDATE_COMMITMENTS_NOOP_MUTATION)}</CodeBlock>

      {queryError && (
        <pre className="text-sm text-destructive">{queryError.message}</pre>
      )}

      <p className="text-sm">
        Current <code>weeklyCallCommitment</code>:{" "}
        <span className="font-mono">
          {queryLoading ? "loading…" : String(current)}
        </span>
      </p>

      <Button
        size="sm"
        variant="outline"
        disabled={mutating || current === null}
        onClick={() =>
          current !== null &&
          runMutation({ variables: { weeklyCallCommitment: current } })
        }
      >
        {mutating ? "Saving…" : "Re-save (no-op)"}
      </Button>

      {mutationError && (
        <pre className="text-sm text-destructive">
          {mutationError.message}
        </pre>
      )}

      {mutationData && (
        <p className="text-sm text-muted-foreground">
          Server returned:{" "}
          <span className="font-mono">
            {String(
              mutationData.UpdateUserSettings?.weeklyCallCommitment,
            )}
          </span>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/examples/mutation-example.tsx
git commit -m "feat: add no-op mutation example component"
```

---

## Task 6: Rewrite `page.tsx` to compose all six cards

**Files:**
- Modify: `src/app/page.tsx` (full rewrite)

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
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

  const { data: countData, error: countError } = await query({
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
            <p className="text-sm">
              Unread notifications:{" "}
              <span className="font-mono">
                {countData?.notifications?.totalCount ?? "—"}
              </span>
            </p>
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
            <em>or</em> whose client full-name contains it. The
            <code> hasClientWith </code>
            clause is the edge-filter pattern.
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
            document with <code>useSuspenseQuery</code>, wrapped in a
            <code> Suspense </code>
            boundary. No waterfall.
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
            needed. A 401 triggers <code>getSession()</code>, which runs the
            Auth.js <code>jwt</code> callback (rotating the Okta{" "}
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
```

- [ ] **Step 2: Run build to verify typecheck passes**

Run: `bun run build`
Expected: Compiles successfully. No import errors. No TS errors.

If build fails with type errors on query `data` shapes (e.g. "Property 'notifications' does not exist on type..."), the queries in Apollo 4 return loosely typed results by default — add inline typing where needed. Do NOT introduce code generation in this task; keep types minimal and local.

- [ ] **Step 3: Run ESLint**

Run: `bun run lint`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: compose six GraphQL reference cards on the home page"
```

---

## Task 7: Browser verification and schema-drift fixes

**Files:**
- May modify: `src/graphql/examples.ts` and/or client components if the live API schema differs from the assumed shape.

- [ ] **Step 1: Start the dev server**

Run: `bun run dev`
Expected: Server starts on http://localhost:3000. Keep this running; open the URL.

- [ ] **Step 2: Log in via Okta**

Navigate to http://localhost:3000. Sign in with Okta. Land on the home page.

- [ ] **Step 3: Verify each card, in order**

For each card, observe:

- **Card 1:** Shows "Unread notifications: <n>". If it shows an error, copy the error text — it indicates the `notifications` / `totalCount` / `where: { read: false }` shape is wrong. Fix the query in `src/graphql/examples.ts` based on the error.

- **Card 2:** Shows up to 5 entries (or "No unread notifications."). If `hasNextPage`, a "Load more" button is visible and appends more entries on click. If shape is wrong, adjust accordingly.

- **Card 3:** Typing less than 2 chars shows "Type at least 2 characters". Typing 2+ chars runs the search and renders matches or "No matches." If the server rejects `nameContainsFold` or `hasClientWith`, adjust field names. (Common alternates in the react-ui worktree: none — those exact names are used, so this should match.)

- **Card 4:** Shows up to 3 entries. No visible waterfall — the list appears immediately (data was preloaded).

- **Card 5:** Shows "Current weeklyCallCommitment: <n>". Clicking "Re-save (no-op)" briefly shows "Saving…" and then "Server returned: <same n>". If `viewer` field is not exposed, the query errors — check the error, and if the root field is `me` or `currentUser`, rename in `src/graphql/examples.ts`.

- **Card 6:** Shows the refresh-link snippet. No live behavior to check.

- [ ] **Step 4: If any card errored, make minimal edits and re-verify**

Typical drift fixes:

- If `viewer` doesn't exist, try `me` then `currentUser`. Edit `WEEKLY_CALL_COMMITMENT_QUERY` in `src/graphql/examples.ts`.
- If `UpdateUserSettings` capitalization differs (e.g. `updateUserSettings`), adjust in both `UPDATE_COMMITMENTS_NOOP_MUTATION` and `mutation-example.tsx`'s reference to `mutationData.UpdateUserSettings`.
- If a query returns nulls instead of errors, that's fine — the UI handles empty states.

After fixing, refresh the page and re-verify the affected card. Do NOT restart `bun run dev`; HMR handles it.

- [ ] **Step 5: Final build + lint pass**

Stop the dev server (`Ctrl+C`). Run:

```bash
bun run build
bun run lint
```

Expected: Both pass.

- [ ] **Step 6: Commit drift fixes (if any)**

If Step 4 required changes:

```bash
git add src/graphql/examples.ts src/components/examples/
git commit -m "fix: align example queries with live API schema"
```

If no drift fixes needed, skip this commit.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Card 1 (RSC scalar) | Task 1 (query), Task 6 (rendering) |
| Card 2 (pagination) | Task 2 (component), Task 6 (composition) |
| Card 3 (search) | Task 3 (component), Task 6 (composition) |
| Card 4 (PreloadQuery) | Task 4 (client consumer), Task 6 (PreloadQuery wiring) |
| Card 5 (no-op mutation) | Task 5 (component), Task 6 (composition) |
| Card 6 (401 explainer) | Task 6 (static snippet in page.tsx) |
| Source-code display via `print(DOC)` | Tasks 2, 3, 5, 6 |
| Delete `src/graphql/example.ts` | Task 1 |
| Schema-drift risk | Task 7 handles it live |

**Placeholder scan:** No TBDs. Every code step shows full code. Task 7 gives concrete fallback field names (`me`, `currentUser`) rather than "handle appropriately."

**Type consistency:** `RECENT_NOTIFICATIONS_QUERY` is imported in pagination-example.tsx, suspense-example.tsx, and page.tsx — same name everywhere. `SUSPENSE_VARS` is exported from suspense-example.tsx and consumed unchanged in page.tsx. Mutation result field access `mutationData.UpdateUserSettings?.weeklyCallCommitment` matches the `UpdateUserSettings` root in the mutation.
