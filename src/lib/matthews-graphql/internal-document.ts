// Internal to the package — bundled with no-restricted-imports' deep-import
// block so consumers can't reach it.
//
// Apollo's `gql` template tag attaches a `loc: Location` field to every AST
// node in a `DocumentNode`. `Location` is a class instance whose
// `startToken`/`endToken` references form a doubly-linked list of `Token`
// instances. React 19 + Next 16 enforce a "plain object" rule across the
// RSC→client serialization boundary and reject any non-plain object — so
// passing a raw `DocumentNode` from an RSC into a "use client" component as
// a prop fails with:
//
//   Only plain objects can be passed to Client Components from Server
//   Components. Location objects are not supported.
//
// `<SafePreload>` (the RSC primitive) hands the same document to its inner
// client components (`<SafePreloadConsumer>` and `<CsrQueryFallback>`) so
// the RSC pre-warm and the CSR consume agree on the operation. `loc` is
// metadata only — Apollo execution and cache key generation never read it
// — so we deep-strip it once, memoise by document identity, and pass the
// stripped copy to every consumer.
import type { DocumentNode } from "graphql";

const cache = new WeakMap<DocumentNode, DocumentNode>();

export function stripDocumentLoc<T extends DocumentNode>(doc: T): T {
  const cached = cache.get(doc);
  if (cached) return cached as T;
  const stripped = stripNode(doc) as T;
  cache.set(doc, stripped);
  return stripped;
}

function stripNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNode);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (key === "loc") continue;
      out[key] = stripNode((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
