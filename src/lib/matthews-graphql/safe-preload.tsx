import type { ReactElement, ReactNode } from "react";
import type {
  ApolloClient as ApolloClientType,
  OperationVariables,
  TypedDocumentNode,
} from "@apollo/client";
import { PreloadQuery, safeQuery } from "./server";

// Async React Server Component. Encapsulates the full RSC->CSR recipe:
//   1. pre-warm with safeQuery (catches stale-token 401s without killing
//      the render);
//   2. on ok, hand off to PreloadQuery so the child useSuspenseQuery
//      reads from the preloaded cache without a waterfall;
//   3. on ok:false, render `fallback` — typically a <CsrQueryFallback>
//      instance for the same query/variables, which recovers by routing
//      the fetch through the client Apollo's ErrorLink retry.
// Non-401 errors propagate out of safeQuery so real upstream bugs surface
// instead of silently falling back.
//
// `PreloadQuery` is invoked directly as a function rather than via JSX so the
// preload side effect (priming the RSC Apollo cache) runs inside SafePreload's
// own async body — predictable, synchronous w.r.t. the `await safeQuery` above,
// and observable from unit tests that `await SafePreload(...)` without a full
// render. React's RSC runtime invokes components with `(props, undefined)`
// (the second arg is legacy context); we match that signature.
type ServerComponent<TProps> = (
  props: TProps,
  legacyContext?: undefined,
) => ReactElement | Promise<ReactElement>;

export async function SafePreload<
  TData = unknown,
  TVariables extends OperationVariables = OperationVariables,
>({
  query,
  variables,
  fallback,
  children,
}: {
  query: TypedDocumentNode<TData, TVariables>;
  variables?: TVariables;
  fallback: ReactNode;
  children: ReactNode;
}) {
  // The cast bridges Apollo's conditional `{} extends TVariables` overload,
  // which TypeScript can't evaluate for a generic `TVariables`. We omit the
  // `variables` key entirely when undefined rather than forwarding `undefined`,
  // mirroring CsrQueryFallback's pattern.
  const result = await safeQuery<TData, TVariables>({
    query,
    ...(variables !== undefined ? { variables } : {}),
  } as ApolloClientType.QueryOptions<TData, TVariables>);

  if (!result.ok) {
    return <>{fallback}</>;
  }

  const preload = PreloadQuery as unknown as ServerComponent<{
    query: TypedDocumentNode<TData, TVariables>;
    variables?: TVariables;
    children: ReactNode;
  }>;
  return preload(
    {
      query,
      ...(variables !== undefined ? { variables } : {}),
      children,
    },
    undefined,
  );
}
