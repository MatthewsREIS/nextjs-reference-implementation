import { beforeEach, describe, expect, test, vi } from "vitest";

// `SafePreload` internally calls `safeQuery` and `PreloadQuery` from ./server.
// Mock them so we assert the branching without exercising Apollo.
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

const { SafePreload } = await import("./safe-preload");

const DOC = { kind: "Document" } as never;
const VARS = { first: 3 };

describe("SafePreload", () => {
  beforeEach(() => {
    mockSafeQuery.mockReset();
    mockPreloadQuery.mockClear();
  });

  test("returns a PreloadQuery element wrapping children on ok:true", async () => {
    mockSafeQuery.mockResolvedValue({ ok: true, data: { x: 1 } });

    const element = await SafePreload({
      query: DOC,
      variables: VARS,
      fallback: <p>FALLBACK</p>,
      children: <p data-testid="child">CHILD</p>,
    });

    expect(mockSafeQuery).toHaveBeenCalledWith({ query: DOC, variables: VARS });
    // JSX `<PreloadQuery ...>` creates an element descriptor — it does not
    // invoke the component. Assert on the element's shape: its `type` must
    // be the (mocked) PreloadQuery reference, and its `props` must carry
    // the query + variables + children forward.
    // Regression guard: if someone reverts to invoking PreloadQuery as a
    // direct function call (pre-`9490f20` pattern), the mock's inner
    // `<div>` return value would flow through and `element.type` would be
    // `"div"`, not `mockPreloadQuery`. This assertion catches that.
    expect(element).toMatchObject({
      type: mockPreloadQuery,
      props: {
        query: DOC,
        variables: VARS,
        children: expect.anything(),
      },
    });
  });

  test("renders fallback on ok:false (stale-token 401)", async () => {
    mockSafeQuery.mockResolvedValue({
      ok: false,
      reason: "stale-token-401",
      error: new Error("401"),
    });

    const element = await SafePreload({
      query: DOC,
      variables: VARS,
      fallback: <p data-testid="fb">FALLBACK</p>,
      children: <p>CHILD</p>,
    });

    expect(mockPreloadQuery).not.toHaveBeenCalled();
    // The returned element should be the fallback node (or contain it).
    expect(JSON.stringify(element)).toContain("FALLBACK");
  });

  test("re-throws when safeQuery throws (non-401 error path)", async () => {
    const boom = new Error("validation failed");
    mockSafeQuery.mockRejectedValue(boom);

    await expect(
      SafePreload({
        query: DOC,
        variables: VARS,
        fallback: <p>FALLBACK</p>,
        children: <p>CHILD</p>,
      }),
    ).rejects.toBe(boom);
  });

  test("rejects when safeQuery throws on malformed response (Phase B1 contract)", async () => {
    // After Phase B1, safeQuery throws "[matthews-graphql] safeQuery: Apollo
    // returned no data and no error" on data:undefined rather than returning
    // ok:true with undefined data. SafePreload has no special handling — it
    // lets the error propagate because its ok:true branch can now trust
    // `data` is defined.
    const boom = new Error(
      "[matthews-graphql] safeQuery: Apollo returned no data and no error",
    );
    mockSafeQuery.mockRejectedValue(boom);

    await expect(
      SafePreload({
        query: DOC,
        variables: VARS,
        fallback: <p>FALLBACK</p>,
        children: <p>CHILD</p>,
      }),
    ).rejects.toBe(boom);
  });
});
