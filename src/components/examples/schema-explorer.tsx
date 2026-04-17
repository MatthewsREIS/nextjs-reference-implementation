"use client";

// Renders the API schema as SDL (Schema Definition Language) by running
// the standard introspection query, reconstructing a GraphQLSchema via
// `buildClientSchema`, and printing it with `printSchema`. Both helpers ship
// with the `graphql` package that Apollo already depends on, so no extra
// runtime is needed. Gated on `mounted` so the fetch only runs client-side
// where the Apollo refresh link can handle 401s.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@apollo/client/react";
import {
  buildClientSchema,
  printSchema,
  type IntrospectionQuery,
} from "graphql";
import { CodeBlock } from "@/components/code-block";
import { INTROSPECTION_QUERY } from "@/graphql/examples";

export function SchemaExplorer() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, loading, error } = useQuery<IntrospectionQuery>(
    INTROSPECTION_QUERY,
    { skip: !mounted, fetchPolicy: "no-cache" },
  );

  const sdl = useMemo(() => {
    if (!data) return null;
    try {
      return printSchema(buildClientSchema(data));
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, [data]);

  if (!mounted || loading) {
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
