"use client";

// Runs the standard introspection query and prints the result as SDL via
// graphql's buildClientSchema + printSchema.

import { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import {
  buildClientSchema,
  printSchema,
  type IntrospectionQuery,
} from "graphql";
import { CodeBlock } from "@/components/code-block";
import { INTROSPECTION_QUERY } from "@/graphql/examples";

export function SchemaExplorer() {
  const { data, loading, error } = useQuery<IntrospectionQuery>(
    INTROSPECTION_QUERY,
    // Introspection responses are large and rarely change during a session.
    // Skip the normalised cache so we neither balloon it nor pay the cost
    // of normalising every schema type. Do not copy this policy to regular
    // queries — it's specific to introspection's size/volatility profile.
    { fetchPolicy: "no-cache" },
  );

  const sdl = useMemo(() => {
    if (!data) return null;
    try {
      return printSchema(buildClientSchema(data));
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [data]);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading introspection…
      </p>
    );
  }
  if (error) {
    return <pre className="text-sm text-destructive">{error.message}</pre>;
  }
  if (!sdl) {
    return (
      <p className="text-sm text-muted-foreground">No schema returned.</p>
    );
  }

  return (
    <CodeBlock
      label="Schema (SDL)"
      className="max-h-[600px] overflow-auto"
    >
      {sdl}
    </CodeBlock>
  );
}
