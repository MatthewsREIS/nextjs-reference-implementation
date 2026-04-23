// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// useMounted is backed by useSyncExternalStore, whose client snapshot
// returns true synchronously during RTL's render. Mock it explicitly so
// tests can drive the pre-mount vs post-mount branches without relying on
// jsdom timing.
const mockMounted = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/use-mounted", () => ({
  useMounted: () => mockMounted.value,
}));

// The Apollo `useQuery` hook is the unit under coupling — stub it so we
// can assert that CsrQueryFallback correctly wires query + variables +
// skip + render prop without running Apollo's real machinery.
const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@apollo/client/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

import { CsrQueryFallback } from "./csr-query-fallback";

const DOC = { kind: "Document" } as never;

function Renderer({ data }: { data: { hello: string } }) {
  return <pre data-testid="out">{JSON.stringify(data)}</pre>;
}

function ErrorComponent({ error }: { error: Error }) {
  return <p>ERR:{error.message}</p>;
}

describe("CsrQueryFallback", () => {
  test("passes skip:true until mounted (first render is the loading slot)", () => {
    mockMounted.value = false;
    mockUseQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    });
    render(
      <CsrQueryFallback
        query={DOC}
        variables={{ first: 3 }}
        loading={<p>LOADING</p>}
        ErrorComponent={ErrorComponent}
        Renderer={Renderer as never}
      />,
    );
    expect(screen.getByText("LOADING")).toBeDefined();
    expect(mockUseQuery).toHaveBeenCalledWith(
      DOC,
      expect.objectContaining({ variables: { first: 3 }, skip: true }),
    );
  });

  test("renders Renderer with data when loading resolves with data", () => {
    mockMounted.value = true;
    mockUseQuery.mockReturnValue({
      data: { hello: "world" },
      loading: false,
      error: undefined,
    });
    render(
      <CsrQueryFallback
        query={DOC}
        variables={{}}
        loading={<p>LOADING</p>}
        ErrorComponent={ErrorComponent}
        Renderer={Renderer}
      />,
    );
    expect(screen.getByTestId("out").textContent).toBe('{"hello":"world"}');
  });

  test("renders ErrorComponent when useQuery returns an error", () => {
    mockMounted.value = true;
    mockUseQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error("boom"),
    });
    render(
      <CsrQueryFallback
        query={DOC}
        variables={{}}
        loading={<p>LOADING</p>}
        ErrorComponent={ErrorComponent}
        Renderer={Renderer as never}
      />,
    );
    expect(screen.getByText("ERR:boom")).toBeDefined();
  });
});
