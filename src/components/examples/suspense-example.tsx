"use client";

import { CodeBlock } from "@/components/code-block";

// Pure renderer + loading/error slots for Card 4. `<SafePreload>` passes
// these across the RSC→client boundary as component references, so they
// live in a "use client" module and are exported as top-level functions
// (not inline closures). See AGENTS.md § Component reference rule.
export type NotificationsData = {
  notifications: {
    edges: Array<{ node: { id: string; createdAt: string } }>;
  };
};

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

export function NotificationsError({ error }: { error: Error }) {
  return <pre className="text-sm text-destructive">{error.message}</pre>;
}

export function NotificationsLoading() {
  return <p className="text-sm text-muted-foreground">Loading…</p>;
}
