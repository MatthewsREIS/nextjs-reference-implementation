import { describe, expect, test } from "vitest";
import { parse } from "graphql";
import { stripDocumentLoc } from "./internal-document";

describe("stripDocumentLoc", () => {
  test("removes the top-level `loc` field that `parse` attaches", () => {
    const doc = parse("{ field }");
    expect(doc.loc).toBeDefined();
    const stripped = stripDocumentLoc(doc);
    expect(stripped.loc).toBeUndefined();
  });

  test("recursively removes `loc` from every nested AST node", () => {
    const doc = parse("query Q($x: Int) { a(b: $x) { c } }");
    // Sanity: parse attaches loc all the way down.
    expect(doc.definitions[0]?.loc).toBeDefined();
    const stripped = stripDocumentLoc(doc);
    const containsLoc = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(containsLoc);
      if (value !== null && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          if (k === "loc" && v !== undefined) return true;
          if (containsLoc(v)) return true;
        }
      }
      return false;
    };
    expect(containsLoc(stripped)).toBe(false);
  });

  test("memoises by document identity", () => {
    const doc = parse("{ field }");
    const a = stripDocumentLoc(doc);
    const b = stripDocumentLoc(doc);
    expect(a).toBe(b);
  });

  test("preserves non-`loc` fields verbatim", () => {
    const doc = parse("{ field }");
    const stripped = stripDocumentLoc(doc);
    expect(stripped.kind).toBe(doc.kind);
    expect(stripped.definitions).toHaveLength(doc.definitions.length);
  });
});
