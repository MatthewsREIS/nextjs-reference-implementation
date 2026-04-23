import { afterEach, describe, expect, test, vi } from "vitest";

// Regression guard for src/lib/matthews-graphql/server.ts:22-26: the module
// throws at load time when imported under `process.env.NEXT_RUNTIME === "edge"`.
// Without this test, softening the throw to a `console.warn` (or removing the
// check entirely) would pass CI silently and re-open the class of bug the
// guard exists to prevent — Node-only code leaking into the edge bundle.
//
// The same mocks as server.test.ts are declared so the import gets far
// enough to hit the guard; without them, `import NextAuth from "next-auth"`
// would fail first under the current next/server resolution mismatch and
// mask the thing we're actually testing.
vi.mock("next-auth", () => ({
  default: () => ({
    handlers: {},
    auth: vi.fn(),
    signIn: () => undefined,
    signOut: () => undefined,
  }),
}));
vi.mock("next-auth/providers/okta", () => ({
  default: () => ({ id: "okta" }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));
vi.mock("@apollo/client-integration-nextjs", () => ({
  registerApolloClient: () => ({
    query: vi.fn(),
    PreloadQuery: vi.fn(),
  }),
  ApolloClient: vi.fn().mockImplementation(() => ({})),
  InMemoryCache: vi.fn().mockImplementation(() => ({})),
}));
vi.mock("@apollo/client", () => ({
  HttpLink: vi.fn().mockImplementation(() => ({})),
}));

describe("edge-runtime guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test("importing /server under NEXT_RUNTIME='edge' throws at module load", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.resetModules();
    await expect(import("./server")).rejects.toThrow(
      /\[matthews-graphql\] \/server is Node-only/,
    );
  });

  test("importing /server without NEXT_RUNTIME does not throw", async () => {
    vi.stubEnv("NEXT_RUNTIME", "");
    vi.resetModules();
    await expect(import("./server")).resolves.toBeDefined();
  });
});
