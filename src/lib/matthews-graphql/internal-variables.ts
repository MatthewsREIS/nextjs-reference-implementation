// Internal to the package — bundled with no-restricted-imports' deep-import
// block so consumers can't reach it.
//
// Apollo's `QueryOptions` / `useQuery.Options` / `useSuspenseQuery.Options`
// types carry a conditional `{} extends TVariables` overload that TypeScript
// can't evaluate for a generic `TVariables`. Everywhere the package
// forwards a caller-supplied `variables` into one of those options objects,
// the spread must *omit* the `variables` key entirely when `undefined` is
// passed — setting `variables: undefined` flips the conditional and breaks
// typing.
//
// This one-liner is the single source of truth for that rule. Each caller
// still has to assert the outer Options type because the three Options
// shapes aren't interchangeable beyond the `variables` field, but the
// omit-vs-forward decision lives here in one place.
export function variablesOrOmit<TVariables>(
  variables: TVariables | undefined,
): { variables?: TVariables } {
  return variables !== undefined ? { variables } : {};
}
