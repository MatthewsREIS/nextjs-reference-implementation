import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useMounted } from "./use-mounted";

function Probe() {
  return createElement("span", null, String(useMounted()));
}

describe("useMounted", () => {
  test("returns false during server rendering", () => {
    const html = renderToStaticMarkup(createElement(Probe));
    expect(html).toBe("<span>false</span>");
  });

  test("returns true on the client", () => {
    const { result } = renderHook(() => useMounted());
    expect(result.current).toBe(true);
  });
});
