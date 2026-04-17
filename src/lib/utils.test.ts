import { describe, expect, test } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  test("joins multiple class strings with a space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  test("drops falsy values passed by clsx", () => {
    expect(cn("a", false, null, undefined, "", 0, "b")).toBe("a b");
  });

  test("resolves conflicting tailwind utilities to the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm text-lg", "text-xl")).toBe("text-xl");
  });

  test("keeps non-conflicting tailwind utilities together", () => {
    expect(cn("px-2", "py-4", "text-sm")).toBe("px-2 py-4 text-sm");
  });

  test("accepts clsx-style arrays and objects", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });

  test("returns an empty string when given no inputs", () => {
    expect(cn()).toBe("");
  });
});
