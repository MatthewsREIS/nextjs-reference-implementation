"use client";

import type { ReactNode } from "react";
import type {
  OperationVariables,
  TypedDocumentNode,
} from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import { useMounted } from "@/lib/use-mounted";

// Client-side fallback for an RSC `<SafePreload>` whose server-side
// `safeQuery` returned ok:false (stale access token after a failed refresh).
// The `useMounted + skip:!mounted` gate defers the fetch to the client runtime
// where the Apollo link chain's response-level ErrorLink can re-fetch the
// session via getSession() and retry the operation. This is the only
// legitimate reason the wrapper uses `useMounted`; agents should not copy
// this gate elsewhere (see AGENTS.md § Client Components).
export function CsrQueryFallback<
  TData = unknown,
  TVariables extends OperationVariables = OperationVariables,
>({
  query,
  variables,
  loading,
  error,
  children,
}: {
  query: TypedDocumentNode<TData, TVariables>;
  variables?: TVariables;
  loading: ReactNode;
  error: (err: Error) => ReactNode;
  children: (result: { data: TData }) => ReactNode;
}) {
  const mounted = useMounted();
  const { data, loading: queryLoading, error: queryError } = useQuery<
    TData,
    TVariables
  >(query, {
    // The non-null-assertion is safe because Apollo ignores `variables` when
    // `skip` is true on first render. Once mounted, real variables flow in.
    variables: variables as TVariables,
    skip: !mounted,
  });

  if (!mounted || queryLoading) return <>{loading}</>;
  if (queryError) return <>{error(queryError)}</>;
  if (data === undefined) return <>{loading}</>;
  return <>{children({ data })}</>;
}
