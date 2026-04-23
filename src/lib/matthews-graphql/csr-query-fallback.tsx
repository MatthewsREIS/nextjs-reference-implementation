"use client";

import type { ComponentType, ReactNode } from "react";
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
  ErrorComponent,
  Renderer,
}: {
  query: TypedDocumentNode<TData, TVariables>;
  variables?: TVariables;
  loading: ReactNode;
  /**
   * Component reference (an imported client component), not an inline
   * closure. Capital-case by convention so a call site that forgets this
   * rule at least reads suspiciously. `<SafePreload>` also hands this prop
   * across the RSC→client boundary; inline arrows defined inside the RSC
   * fail with "Functions cannot be passed directly to Client Components."
   */
  ErrorComponent: ComponentType<{ error: Error }>;
  /**
   * Component reference (an imported client component), not an inline
   * closure. Same RSC→client serialization rule as `ErrorComponent`.
   */
  Renderer: ComponentType<{ data: TData }>;
}) {
  const mounted = useMounted();
  // The `as useQuery.Options<…>` assertion bridges Apollo's conditional
  // `{} extends TVariables` overload, which TypeScript can't evaluate with
  // a generic `TVariables`. It does NOT cast `undefined` into a required
  // `TVariables` value — omitting the key instead of forwarding `undefined`
  // is the whole point.
  const {
    data,
    loading: queryLoading,
    error: queryError,
  } = useQuery<TData, TVariables>(query, {
    ...(variables !== undefined ? { variables } : {}),
    skip: !mounted,
  } as useQuery.Options<TData, TVariables>);

  if (!mounted || queryLoading) return <>{loading}</>;
  if (queryError) return <ErrorComponent error={queryError} />;
  if (data === undefined) {
    return (
      <ErrorComponent
        error={
          new Error(
            "[matthews-graphql] CsrQueryFallback: Apollo returned no data and no error",
          )
        }
      />
    );
  }
  return <Renderer data={data} />;
}
