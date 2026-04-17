"use client";

import dynamic from "next/dynamic";

// graphql-voyager's bundled code references `self` at module scope, which
// crashes SSR. Loading it via next/dynamic with ssr:false ensures the
// module isn't evaluated on the server at all.
export const SchemaExplorerClient = dynamic(
  () =>
    import("@/components/examples/schema-explorer").then(
      (m) => m.SchemaExplorer,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">
        Loading schema explorer…
      </p>
    ),
  },
);
