"use client";

// Introspection + visualization via graphql-voyager. Voyager uses browser-
// only APIs (SVG sizing, d3-force) and its package lacks React 19 peer
// metadata — we `skip` until mount so SSR never tries to render it.

import { useEffect, useState } from "react";
import { useQuery } from "@apollo/client/react";
import { Voyager } from "graphql-voyager";
import type { IntrospectionQuery } from "graphql";
import "graphql-voyager/dist/voyager.css";
import { INTROSPECTION_QUERY } from "@/graphql/examples";

export function SchemaExplorer() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, loading, error } = useQuery<IntrospectionQuery>(
    INTROSPECTION_QUERY,
    { skip: !mounted },
  );

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
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">No schema returned.</p>
    );
  }

  return (
    <div className="h-[600px] overflow-hidden rounded-md border">
      <Voyager introspection={{ data }} hideVoyagerLogo />
    </div>
  );
}
