// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CsrQueryFallback } from "./csr-query-fallback";

// The Apollo `useQuery` hook is the unit under coupling — stub it so we
// can assert that CsrQueryFallback correctly wires query + variables +
// skip + render prop without running Apollo's real machinery.
const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@apollo/client/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

const DOC = { kind: "Document" } as never;

describe("CsrQueryFallback", () => {
  test("passes skip:true until mounted (first render is the loading slot)", () => {
    mockUseQuery.mockReturnValue({ data: undefined, loading: true, error: undefined });
    render(
      <CsrQueryFallback
        query={DOC}
        variables={{ first: 3 }}
        loading={<p>LOADING</p>}
        error={(e) => <p>{e.message}</p>}
      >
        {({ data }) => <pre>{JSON.stringify(data)}</pre>}
      </CsrQueryFallback>,
    );
    expect(screen.getByText("LOADING")).toBeDefined();
    // First call sees skip:true so the wire never fires during SSR/pre-mount.
    expect(mockUseQuery).toHaveBeenCalledWith(
      DOC,
      expect.objectContaining({ variables: { first: 3 }, skip: true }),
    );
  });

  test("renders children({ data }) when loading resolves with data", () => {
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
        error={(e) => <p>ERR:{e.message}</p>}
      >
        {({ data }) => <pre data-testid="out">{JSON.stringify(data)}</pre>}
      </CsrQueryFallback>,
    );
    expect(screen.getByTestId("out").textContent).toBe('{"hello":"world"}');
  });

  test("renders error slot when useQuery returns an error", () => {
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
        error={(e) => <p>ERR:{e.message}</p>}
      >
        {({ data }) => <pre>{JSON.stringify(data)}</pre>}
      </CsrQueryFallback>,
    );
    expect(screen.getByText("ERR:boom")).toBeDefined();
  });
});
