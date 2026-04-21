"use client";

// Renders the API schema as SDL (Schema Definition Language) by running
// the standard introspection query, reconstructing a GraphQLSchema via
// `buildClientSchema`, and printing it with `printSchema`. Both helpers ship
// with the `graphql` package that Apollo already depends on, so no extra
// runtime is needed.
//
// `skip: !mounted` defers the fetch to the client so an expired access token
// is recovered by the client Apollo refreshLink (the RSC Apollo client has no
// refreshLink, so a 401 there would crash the page). With the session
// pre-populated into SessionProvider at the root layout, the client token is
// ready on first render — the gate costs one extra render, not a round-trip.

import { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import {
  buildClientSchema,
  printSchema,
  type IntrospectionQuery,
} from "graphql";
import { CodeBlock } from "@/components/code-block";
import { INTROSPECTION_QUERY } from "@/graphql/examples";
import { useMounted } from "@/lib/use-mounted";

export function SchemaExplorer() {
  const mounted = useMounted();

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
