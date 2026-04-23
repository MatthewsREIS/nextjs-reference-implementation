import type { ReactNode } from "react";
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

  // `TypedPreloadQuery` pins the generic shape TS can actually evaluate.
  // Apollo's real `PreloadQuery` props inherit a `{} extends TVariables`
  // conditional overload from `Omit<QueryOptions, "query">`, which TS
  // can't resolve for a generic `TVariables` here. Concrete call sites
  // (see `src/app/page.tsx`) typecheck the same JSX without any cast —
  // this alias is scoped to SafePreload's generic boundary.
  const TypedPreloadQuery = PreloadQuery as (props: {
    query: TypedDocumentNode<TData, TVariables>;
    variables?: TVariables;
    children: ReactNode;
  }) => ReturnType<typeof PreloadQuery>;
  return (
    <TypedPreloadQuery query={query} variables={variables}>
      {children}
    </TypedPreloadQuery>
  );
}
