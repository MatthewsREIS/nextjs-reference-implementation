"use client";

import type { ComponentType } from "react";
import type {
  OperationVariables,
  TypedDocumentNode,
} from "@apollo/client";
import { useSuspenseQuery } from "@apollo/client/react";
import { variablesOrOmit } from "./internal-variables";

// Internal to <SafePreload>'s ok:true branch. Reads from the cache that
// <PreloadQuery> pre-warmed and hands the data to `Renderer`. Lives in its
// own "use client" module because <SafePreload> is an async RSC and can't
// carry a "use client" directive.
export function SafePreloadConsumer<
  TData = unknown,
  TVariables extends OperationVariables = OperationVariables,
>({
  query,
  variables,
  Renderer,
}: {
  query: TypedDocumentNode<TData, TVariables>;
  variables?: TVariables;
  /**
   * Component reference (an imported client component), not an inline
   * closure. `SafePreload` passes this across the RSC→client boundary;
   * closures defined inside an RSC fail to serialize with "Functions
   * cannot be passed directly to Client Components."
   */
  Renderer: ComponentType<{ data: TData }>;
}) {
  // `{} extends TVariables` bridge cast: same pattern as CsrQueryFallback /
  // SafePreload. `variablesOrOmit` centralises the "omit when undefined
  // rather than forward undefined" rule. The result cast narrows Apollo's
  // dataState union (which widens `data` to `TData | undefined` across
  // overloads that include "empty"/"partial" states) — none of those states
  // apply here because we don't pass `skip` or `returnPartialData`, but TS
  // can't see that through the generic overload resolution.
  const { data } = useSuspenseQuery<TData, TVariables>(query, {
    ...variablesOrOmit(variables),
  } as useSuspenseQuery.Options<TVariables>) as { data: TData };
  return <Renderer data={data} />;
}
