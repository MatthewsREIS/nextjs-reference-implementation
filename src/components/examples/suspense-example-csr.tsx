"use client";

// Client-only fallback used by the home page when the server-side
// PreloadQuery 401s. During SSR the Apollo client in `client.tsx` has no
// access token (the ref is populated in a useEffect that doesn't run on the
// server), so a suspense-style fetch during SSR always 401s and crashes the
// RSC tree. This component `skip`s the query until after mount, so the
// first fetch runs purely client-side where the refreshLink can handle auth.

import { useQuery } from "@apollo/client/react";
import { CodeBlock } from "@/components/code-block";
import { RECENT_NOTIFICATIONS_QUERY } from "@/graphql/examples";
import { SUSPENSE_VARS } from "@/components/examples/suspense-example";
import { useMounted } from "@/lib/use-mounted";

type NotificationsData = {
  notifications: {
    edges: Array<{ node: { id: string; createdAt: string } }>;
  };
};

export function SuspenseExampleCsr() {
  const mounted = useMounted();

  const { data, loading, error } = useQuery<NotificationsData>(
    RECENT_NOTIFICATIONS_QUERY,
    { variables: SUSPENSE_VARS, skip: !mounted },
  );

  if (!mounted || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (error) {
    return <pre className="text-sm text-destructive">{error.message}</pre>;
  }

  const edges = data?.notifications?.edges ?? [];

  return (
    <div className="space-y-3">
      <CodeBlock label="Response">{JSON.stringify(data, null, 2)}</CodeBlock>

      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Rendered
      </p>

      {edges.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No unread notifications.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {edges.map(
            (edge: { node: { id: string; createdAt: string } }) => (
              <li key={edge.node.id} className="font-mono text-xs">
                {edge.node.createdAt} — {edge.node.id}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
