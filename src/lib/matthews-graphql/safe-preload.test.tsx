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

  test("renders PreloadQuery with children on ok:true", async () => {
    mockSafeQuery.mockResolvedValue({ ok: true, data: { x: 1 } });

    const element = await SafePreload({
      query: DOC,
      variables: VARS,
      fallback: <p>FALLBACK</p>,
      children: <p data-testid="child">CHILD</p>,
    });

    expect(mockSafeQuery).toHaveBeenCalledWith({ query: DOC, variables: VARS });
    // Rendered tree should be a PreloadQuery call wrapping the child.
    expect(mockPreloadQuery).toHaveBeenCalledWith(
      expect.objectContaining({ query: DOC, variables: VARS }),
      undefined,
    );
    expect(element).toBeDefined();
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
});
