"use client";

import { useQuery } from "@apollo/client/react";
import { print } from "graphql";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";
import { RECENT_NOTIFICATIONS_QUERY } from "@/graphql/examples";

const PAGE_SIZE = 5;

type NotificationsData = {
  notifications: {
    edges: Array<{
      node: { id: string; createdAt: string; read: boolean };
    }>;
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
};

export function PaginationExample() {
  const { data, loading, error, fetchMore } = useQuery<NotificationsData>(
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

      {data && <CodeBlock>{JSON.stringify(data, null, 2)}</CodeBlock>}
    </div>
  );
}
