import { Suspense, type ComponentType, type ReactNode } from "react";
import type {
  ApolloClient as ApolloClientType,
  OperationVariables,
  TypedDocumentNode,
} from "@apollo/client";
import { PreloadQuery, safeQuery } from "./server";
import { SafePreloadConsumer } from "./safe-preload-consumer";
import { CsrQueryFallback } from "./csr-query-fallback";
import { variablesOrOmit } from "./internal-variables";

// Async React Server Component. The canonical recipe for an
// "authenticated query with RSC preload + CSR stale-token recovery" collapses
// here to: one `Renderer`, one `ErrorComponent`, one `loading` node, and the
// `query` + `variables`. SafePreload wires up the rest:
//
//   1. Pre-warm with safeQuery. Non-401 errors propagate so real upstream
//      bugs surface instead of silently falling back.
//   2. On ok: render <PreloadQuery> → <Suspense fallback={loading}> →
//      <SafePreloadConsumer> (reads the preloaded cache via useSuspenseQuery
//      and hands data to `Renderer`).
//   3. On ok:false (stale-token 401): render <CsrQueryFallback> with the
//      same query/variables/Renderer/ErrorComponent/loading. The client
//      Apollo's ErrorLink re-fetches the session via getSession() and
//      retries, recovering the call.
export async function SafePreload<
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
   * closure. This prop crosses the RSC→client boundary via CsrQueryFallback
   * and SafePreloadConsumer; inline arrows defined inside the RSC will fail
   * with "Functions cannot be passed directly to Client Components."
   */
  ErrorComponent: ComponentType<{ error: Error }>;
  /**
   * Component reference (an imported client component), not an inline
   * closure. Same RSC→client serialization rule as `ErrorComponent`.
   */
  Renderer: ComponentType<{ data: TData }>;
}) {
  // The cast bridges Apollo's conditional `{} extends TVariables` overload,
  // which TypeScript can't evaluate for a generic `TVariables`.
  // `variablesOrOmit` centralises the "omit vs. forward" rule.
  const variablesProp = variablesOrOmit(variables);
  const result = await safeQuery<TData, TVariables>({
    query,
    ...variablesProp,
  } as ApolloClientType.QueryOptions<TData, TVariables>);

  if (!result.ok) {
    return (
      <CsrQueryFallback
        query={query}
        {...variablesProp}
        loading={loading}
        ErrorComponent={ErrorComponent}
        Renderer={Renderer}
      />
    );
  }

  // `TypedPreloadQuery` pins the generic shape TS can actually evaluate.
  // Apollo's real `PreloadQuery` props inherit a `{} extends TVariables`
  // conditional overload from `Omit<QueryOptions, "query">`, which TS
  // can't resolve for a generic `TVariables` here. Concrete call sites
  // typecheck the same JSX without any cast — this alias is scoped to
  // SafePreload's generic boundary.
  const TypedPreloadQuery = PreloadQuery as (props: {
    query: TypedDocumentNode<TData, TVariables>;
    variables?: TVariables;
    children: ReactNode;
  }) => ReturnType<typeof PreloadQuery>;
  return (
    <TypedPreloadQuery query={query} {...variablesProp}>
      <Suspense fallback={loading}>
        <SafePreloadConsumer
          query={query}
          {...variablesProp}
          Renderer={Renderer}
        />
      </Suspense>
    </TypedPreloadQuery>
  );
}
