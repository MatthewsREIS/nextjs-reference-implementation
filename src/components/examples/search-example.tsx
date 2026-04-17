"use client";

import { useState } from "react";
import { useQuery } from "@apollo/client/react";
import { print } from "graphql";
import { CodeBlock } from "@/components/code-block";
import { SEARCH_PROPOSALS_QUERY } from "@/graphql/examples";

type ProposalsData = {
  proposals: {
    edges: Array<{
      node: {
        id: string;
        name: string;
        client: { id: string; fullName: string } | null;
      };
    }>;
  };
};

export function SearchExample() {
  const [query, setQuery] = useState("");
  const skip = query.trim().length < 2;

  const { data, loading, error } = useQuery<ProposalsData>(
    SEARCH_PROPOSALS_QUERY,
    { variables: { query }, skip },
  );

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
