"use client";

import { useSuspenseQuery } from "@apollo/client/react";
import { CodeBlock } from "@/components/code-block";
import { RECENT_NOTIFICATIONS_QUERY } from "@/graphql/examples";

// Variables MUST match the <PreloadQuery> call in page.tsx so the client
// re-reads from the preloaded cache instead of issuing a fresh request.
export const SUSPENSE_VARS = { first: 3, after: null, read: false };

type NotificationsData = {
  notifications: {
    edges: Array<{ node: { id: string; createdAt: string } }>;
  };
};

export function SuspenseExample() {
  const { data } = useSuspenseQuery<NotificationsData>(
    RECENT_NOTIFICATIONS_QUERY,
    { variables: SUSPENSE_VARS },
  );

  const edges = data?.notifications?.edges ?? [];

  return (
    <div className="space-y-3">
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
      <CodeBlock>{JSON.stringify(data, null, 2)}</CodeBlock>
    </div>
  );
}
