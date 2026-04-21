import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Session } from "next-auth";

// Capture the props handed to SessionProvider so we can assert what the
// layout-level Providers is passing downstream. ApolloWrapper is mocked out
// because it depends on Apollo/SessionProvider runtime wiring that isn't
// relevant to this test.
const sessionProviderSpy = vi.fn(
  ({ children }: { children: React.ReactNode }) => <>{children}</>,
);

vi.mock("next-auth/react", () => ({
  SessionProvider: (props: Record<string, unknown>) =>
    sessionProviderSpy(props as never),
}));

vi.mock("@/lib/apollo/client", () => ({
  ApolloWrapper: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const { Providers } = await import("./providers");

describe("Providers", () => {
  afterEach(() => {
    cleanup();
    sessionProviderSpy.mockClear();
  });

  test("forwards the server-fetched session into SessionProvider", () => {
    const session = {
      user: { email: "u@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
      accessToken: "AT",
    } as Session;

    render(<Providers session={session}>child</Providers>);

    expect(sessionProviderSpy).toHaveBeenCalledTimes(1);
    const props = sessionProviderSpy.mock.calls[0]![0] as { session?: Session };
    expect(props.session).toEqual(session);
  });

  test("works without a session prop for unauthenticated shells", () => {
    render(<Providers>child</Providers>);

    expect(sessionProviderSpy).toHaveBeenCalledTimes(1);
    const props = sessionProviderSpy.mock.calls[0]![0] as { session?: Session };
    expect(props.session).toBeUndefined();
  });
});
