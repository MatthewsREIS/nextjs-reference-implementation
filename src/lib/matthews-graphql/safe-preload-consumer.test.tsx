// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUseSuspenseQuery = vi.hoisted(() => vi.fn());
vi.mock("@apollo/client/react", () => ({
  useSuspenseQuery: (...args: unknown[]) => mockUseSuspenseQuery(...args),
}));

import { SafePreloadConsumer } from "./safe-preload-consumer";

const DOC = { kind: "Document" } as never;

function Renderer({ data }: { data: { hello: string } }) {
  return <pre data-testid="out">{JSON.stringify(data)}</pre>;
}

describe("SafePreloadConsumer", () => {
  beforeEach(() => {
    mockUseSuspenseQuery.mockReset();
  });

  test("calls useSuspenseQuery with query + variables and renders via Renderer", () => {
    mockUseSuspenseQuery.mockReturnValue({ data: { hello: "world" } });
    render(
      <SafePreloadConsumer
        query={DOC}
        variables={{ first: 3 }}
        Renderer={Renderer as never}
      />,
    );
    expect(mockUseSuspenseQuery).toHaveBeenCalledWith(
      DOC,
      expect.objectContaining({ variables: { first: 3 } }),
    );
    expect(screen.getByTestId("out").textContent).toBe('{"hello":"world"}');
  });

  test("omits variables key when undefined (no-variables query)", () => {
    mockUseSuspenseQuery.mockReturnValue({ data: { hello: "x" } });
    render(<SafePreloadConsumer query={DOC} Renderer={Renderer as never} />);
    const call = mockUseSuspenseQuery.mock.calls[0];
    expect(call[0]).toBe(DOC);
    // Matches the CsrQueryFallback/SafePreload pattern — don't forward
    // `undefined` into Apollo's variables slot; just omit the key.
    expect(call[1]).not.toHaveProperty("variables");
  });
});
