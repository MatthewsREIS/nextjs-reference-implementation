# GraphQL Examples on the Home Page

## Purpose

This is a reference repository. The home page should demonstrate the core
GraphQL patterns a developer needs when building on this stack: server-side
queries in RSC, client-side queries with pagination and filtering, the
`PreloadQuery` → `useSuspenseQuery` handoff, a `useMutation` call, and the
auth-refresh behavior.

Every example displays its source (the exact `gql` document being executed)
alongside the live result fetched from the real Artemis endpoint configured
in `.env.local`.

## Goals

- Six cards on the home page, each a self-contained, minimal example.
- Source code visible next to live output — developers can read the pattern
  and see its result without leaving the page.
- A single source of truth: the source code shown is printed from the same
  `DocumentNode` that Apollo executes.
- No backend side effects from the mutation example (true no-op).

## Non-goals

- Interactive demonstration of the 401-refresh flow. This is time-based and
  fragile to trigger on demand. We explain it with a static code snippet and
  a link to the implementation.
- Fancy code highlighting. Plain `<pre>` styled with Tailwind is sufficient
  for a reference repo.
- Debounced search input. `skip` until the input has 2+ characters keeps
  the example small.

## Cards

### 1. RSC server query

Pattern: scalar query + `where` filter, executed in the server component via
`query({ query })` from `src/lib/apollo/server.ts`.

```graphql
query NotificationsCount {
  notifications(where: { read: false }) {
    totalCount
  }
}
```

Renders the `totalCount` inline.

### 2. Client `useQuery` with cursor pagination

Pattern: relay-style `edges { node }` + `pageInfo`, `orderBy`, `fetchMore`
driven by a **Load more** button.

```graphql
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
```

Component: `src/components/examples/pagination-example.tsx` — `"use client"`,
uses `useQuery` + `fetchMore` with `updateQuery` merging the new edges.

### 3. Client `useQuery` with search, edge filtering, and `or`

Pattern: controlled text input, `skip` until length ≥ 2, demonstrates
`or`-composed `where`, `nameContainsFold` (Meilisearch-fold text match), and
edge filtering (`hasClientWith`).

```graphql
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
```

Component: `src/components/examples/search-example.tsx`.

### 4. `PreloadQuery` → `useSuspenseQuery`

Pattern: the server component starts the fetch via `PreloadQuery` (from
`@/lib/apollo/server.ts`); a client child wrapped in `<Suspense>` consumes it
with `useSuspenseQuery`. Reuses the pagination query from card 2 (different
variables to avoid cache collision: first=3, unread only).

Component: `src/components/examples/suspense-example.tsx` — minimal
client component that calls `useSuspenseQuery` and renders the first three
edges.

### 5. `useMutation` (no-op)

Pattern: one query reads the current value; the button fires a mutation that
writes the **same** value back. Real mutation exercised, no data changes.

Query:

```graphql
query WeeklyCallCommitment {
  viewer {
    id
    weeklyCallCommitment
  }
}
```

_(If the schema exposes the current user under a different root field — e.g.
`me` or `currentUser` — we adjust during implementation.)_

Mutation:

```graphql
mutation UpdateCommitmentsNoOp($weeklyCallCommitment: Int!) {
  UpdateUserSettings(input: { weeklyCallCommitment: $weeklyCallCommitment }) {
    weeklyCallCommitment
  }
}
```

Component: `src/components/examples/mutation-example.tsx` — displays the
current value, a button "Re-save (no-op)", and the mutation result / loading
/ error state.

### 6. 401 refresh explainer (no live demo)

Static card. Shows a snippet of the `refreshLink` block from
`src/lib/apollo/client.tsx:47-68` and explains: a 401 from Artemis triggers
`getSession()` (which runs the Auth.js `jwt` callback → rotates the Okta
`access_token`), the retry is attempted once with the new token, and a
second 401 bubbles as a normal error with `RefreshAccessTokenError` on the
session. Includes a link to the file.

## Source-code rendering

Each card's source block is produced by:

```ts
import { print } from "graphql";
// …
<CodeBlock>{print(DOCUMENT_NODE)}</CodeBlock>
```

This guarantees the code displayed is byte-identical to what Apollo sends
over the wire.

## File layout

New:

- `src/graphql/examples.ts` — all example `gql` documents (queries +
  mutation) in one focused file.
- `src/components/code-block.tsx` — `<pre>` styled with Tailwind
  (`bg-muted`, `rounded-md`, `text-xs`, `overflow-x-auto`). Accepts
  `children: string`.
- `src/components/examples/pagination-example.tsx`
- `src/components/examples/search-example.tsx`
- `src/components/examples/suspense-example.tsx`
- `src/components/examples/mutation-example.tsx`

Changed:

- `src/app/page.tsx` — composes the six cards, runs the RSC query (card 1),
  issues the `PreloadQuery` (card 4), and embeds the client components.

Deleted:

- `src/graphql/example.ts` — superseded by `src/graphql/examples.ts`.

## Risks

- **Schema drift.** The example queries assume the field shapes observed in
  `../worktrees/main/react-ui/src/graphql/`. If Artemis differs (e.g.
  `viewer` is called `me`), we adjust during first live run.
- **Empty data.** If the user has zero notifications and no matching
  proposals, the cards render empty states. Each card must handle this
  gracefully with a short "no results" message.
- **Mutation precondition.** The no-op mutation requires `weeklyCallCommitment`
  to be non-null for the current user. If it's null in the schema, the
  mutation example falls back to a different idempotent settings field (e.g.
  re-applying the current `calendarURL`). Decided at implementation time
  based on what the live query returns.

## Out of scope

- Tests. Reference repo, live endpoint — behavioral validation is
  eyeballing the browser.
- Pagination "Previous" button. Only **Load more** (forward cursor) is
  demonstrated.
- Error retry UX beyond what Apollo provides by default. Errors render into
  a `<pre>` beneath each card's result.
