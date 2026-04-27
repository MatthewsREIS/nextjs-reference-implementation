import { Suspense, isValidElement } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { parse } from "graphql";

// `SafePreload` internally calls `safeQuery` + `PreloadQuery` from ./server,
// `SafePreloadConsumer` from ./safe-preload-consumer, and `CsrQueryFallback`
// from ./csr-query-fallback. Mock each so the branching is observable
// without running Apollo or Suspense.
const mockSafeQuery = vi.hoisted(() => vi.fn());
const mockPreloadQuery = vi.hoisted(() =>
  vi.fn((props: { children: React.ReactNode }) => (
    <div data-testid="preload">{props.children}</div>
  )),
);
vi.mock("./server", () => ({
  safeQuery: mockSafeQuery,
  PreloadQuery: mockPreloadQuery,
}));

const mockConsumer = vi.hoisted(() =>
  vi.fn(() => <div data-testid="consumer" />),
);
vi.mock("./safe-preload-consumer", () => ({
  SafePreloadConsumer: mockConsumer,
}));

const mockCsrQueryFallback = vi.hoisted(() =>
  vi.fn(() => <div data-testid="csr" />),
);
vi.mock("./csr-query-fallback", () => ({
  CsrQueryFallback: mockCsrQueryFallback,
}));

const { SafePreload } = await import("./safe-preload");

const DOC = { kind: "Document" } as never;
const VARS = { first: 3 };

function Renderer({ data }: { data: unknown }) {
  return <>{JSON.stringify(data)}</>;
}
function ErrorComponent({ error }: { error: Error }) {
  return <>{error.message}</>;
}

describe("SafePreload", () => {
  beforeEach(() => {
    mockSafeQuery.mockReset();
    mockPreloadQuery.mockClear();
    mockConsumer.mockClear();
    mockCsrQueryFallback.mockClear();
  });

  test("renders PreloadQuery wrapping Suspense→SafePreloadConsumer on ok:true", async () => {
    mockSafeQuery.mockResolvedValue({ ok: true, data: { x: 1 } });

    const element = await SafePreload({
      query: DOC,
      variables: VARS,
      loading: <p data-testid="loading">LOADING</p>,
      ErrorComponent,
      Renderer,
    });

    expect(mockSafeQuery).toHaveBeenCalledWith({ query: DOC, variables: VARS });
    // Outer element is a PreloadQuery with the query+variables threaded through.
    expect(isValidElement(element)).toBe(true);
    expect(element).toMatchObject({
      type: mockPreloadQuery,
      props: { query: DOC, variables: VARS },
    });
    // Its children wrap a Suspense boundary whose fallback is the provided
    // `loading` node and whose child is SafePreloadConsumer wired with the
    // same query + variables + Renderer — so the canonical recipe collapses
    // to one authored renderer + one loading node (no outer <Suspense> or
    // hand-authored CsrQueryFallback).
    const elementTyped = element as { props: { children: unknown } };
    const suspense = elementTyped.props.children as {
      type: unknown;
      props: { fallback: unknown; children: unknown };
    };
    expect(suspense.type).toBe(Suspense);
    expect(suspense.props.fallback).toMatchObject({
      props: { "data-testid": "loading" },
    });
    expect(suspense.props.children).toMatchObject({
      type: mockConsumer,
      props: { query: DOC, variables: VARS, Renderer },
    });
  });

  test("renders CsrQueryFallback with forwarded props on ok:false (stale-token 401)", async () => {
    mockSafeQuery.mockResolvedValue({
      ok: false,
      reason: "stale-token-401",
      error: new Error("401"),
    });

    const element = await SafePreload({
      query: DOC,
      variables: VARS,
      loading: <p>LOADING</p>,
      ErrorComponent,
      Renderer,
    });

    expect(mockPreloadQuery).not.toHaveBeenCalled();
    // Forward every consumer-authored prop to CsrQueryFallback — the user
    // shouldn't have to author the renderer or loading element twice.
    expect(element).toMatchObject({
      type: mockCsrQueryFallback,
      props: {
        query: DOC,
        variables: VARS,
        loading: expect.anything(),
        ErrorComponent,
        Renderer,
      },
    });
  });

  test("re-throws when safeQuery throws (non-401 error path)", async () => {
    const boom = new Error("validation failed");
    mockSafeQuery.mockRejectedValue(boom);

    await expect(
      SafePreload({
        query: DOC,
        variables: VARS,
        loading: <p>LOADING</p>,
        ErrorComponent,
        Renderer,
      }),
    ).rejects.toBe(boom);
  });

  test("rejects when safeQuery throws on malformed response (Phase B1 contract)", async () => {
    // safeQuery throws on data:undefined — SafePreload lets the error
    // propagate because its ok:true branch can trust `data` is defined.
    const boom = new Error(
      "[matthews-graphql] safeQuery: Apollo returned no data and no error",
    );
    mockSafeQuery.mockRejectedValue(boom);

    await expect(
      SafePreload({
        query: DOC,
        variables: VARS,
        loading: <p>LOADING</p>,
        ErrorComponent,
        Renderer,
      }),
    ).rejects.toBe(boom);
  });

  test("strips `loc` from the DocumentNode before passing it across the RSC→client boundary", async () => {
    // React 19 + Next 16 reject `Location` (a class instance attached by
    // Apollo's `gql` template tag) across the RSC→client serialization
    // boundary. SafePreload hands the same document to its inner client
    // components (and the safeQuery pre-warm), so the loc must be stripped
    // first. Regression guard.
    const realDoc = parse("query Q { a }");
    expect(realDoc.loc).toBeDefined();
    mockSafeQuery.mockResolvedValue({ ok: true, data: { a: 1 } });

    const element = (await SafePreload({
      query: realDoc,
      loading: <p>LOADING</p>,
      ErrorComponent,
      Renderer,
    })) as {
      props: {
        query: { loc?: unknown };
        children: { props: { children: { props: { query: { loc?: unknown } } } } };
      };
    };

    const safeQueryArg = mockSafeQuery.mock.calls[0]![0] as {
      query: { loc?: unknown };
    };
    expect(safeQueryArg.query.loc).toBeUndefined();
    expect(element.props.query.loc).toBeUndefined();
    expect(
      element.props.children.props.children.props.query.loc,
    ).toBeUndefined();
  });

  test("strips `loc` on the ok:false branch too (CsrQueryFallback receives a plain doc)", async () => {
    const realDoc = parse("query Q { a }");
    expect(realDoc.loc).toBeDefined();
    mockSafeQuery.mockResolvedValue({
      ok: false,
      reason: "stale-token-401",
      error: new Error("401"),
    });

    const element = (await SafePreload({
      query: realDoc,
      loading: <p>LOADING</p>,
      ErrorComponent,
      Renderer,
    })) as { props: { query: { loc?: unknown } } };

    expect(element.props.query.loc).toBeUndefined();
  });

  test("omits variables when undefined (no-variables query)", async () => {
    mockSafeQuery.mockResolvedValue({ ok: true, data: { x: 1 } });

    await SafePreload({
      query: DOC,
      loading: <p>LOADING</p>,
      ErrorComponent,
      Renderer,
    });

    // Omitting the key (vs forwarding undefined) keeps Apollo's
    // "{} extends TVariables" conditional overload happy; regression guard.
    expect(mockSafeQuery).toHaveBeenCalledWith({ query: DOC });
  });
});
