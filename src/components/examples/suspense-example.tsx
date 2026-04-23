"use client";

import { useSuspenseQuery } from "@apollo/client/react";
import { CodeBlock } from "@/components/code-block";
import { RECENT_NOTIFICATIONS_QUERY } from "@/graphql/examples";

export type NotificationsData = {
  notifications: {
    edges: Array<{ node: { id: string; createdAt: string } }>;
  };
};

// Pure renderer — used by both the preloaded (useSuspenseQuery) and the
// CSR-fallback (useQuery) code paths so the two branches stay in sync.
export function NotificationsView({ data }: { data: NotificationsData }) {
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
          {edges.map((edge) => (
            <li key={edge.node.id} className="font-mono text-xs">
              {edge.node.createdAt} — {edge.node.id}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Used as the child of <SafePreload>. Reads from the preloaded cache.
export function SuspenseExample({
  variables,
}: {
  variables: { first: number; after: string | null; read: boolean };
}) {
  const { data } = useSuspenseQuery<NotificationsData>(
    RECENT_NOTIFICATIONS_QUERY,
    { variables },
  );
  return <NotificationsView data={data} />;
}

export function NotificationsError({ error }: { error: Error }) {
  return <pre className="text-sm text-destructive">{error.message}</pre>;
}

export function NotificationsLoading() {
  return <p className="text-sm text-muted-foreground">Loading…</p>;
}
