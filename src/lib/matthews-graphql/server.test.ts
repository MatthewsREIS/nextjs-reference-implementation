import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Account, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

// `./auth` calls NextAuth() at module load to build the real handlers.
// Stub the factory out so importing this file doesn't drag in next-auth's
// runtime (which currently has a `next/server` resolution mismatch against
// Next 16). The callbacks we want to test are defined as plain named
// exports, so they're unaffected by the stub.
const mockAuth = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    // Mirror Next.js: redirect() throws to short-circuit rendering.
    const e = new Error(`NEXT_REDIRECT:${url}`);
    throw e;
  }),
);
const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  default: () => ({
    handlers: {},
    auth: mockAuth,
    signIn: () => undefined,
    signOut: () => undefined,
  }),
}));
vi.mock("next-auth/providers/okta", () => ({
  default: () => ({ id: "okta" }),
}));
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));
vi.mock("@apollo/client-integration-nextjs", () => ({
  registerApolloClient: (fn: () => unknown) => ({
    query: mockQuery,
    PreloadQuery: vi.fn(),
    getClient: fn,
  }),
  ApolloClient: vi.fn().mockImplementation(() => ({})),
  InMemoryCache: vi.fn().mockImplementation(() => ({})),
}));
vi.mock("@apollo/client", () => ({
  HttpLink: vi.fn().mockImplementation(() => ({})),
}));
// safeQuery uses ServerError.is() to detect stale-token 401s. Mock the type
// guard so tests can fabricate "ServerError-shaped" errors without pulling in
// Apollo's real branded-instance machinery.
vi.mock("@apollo/client/errors", () => ({
  ServerError: {
    is: (e: unknown): boolean =>
      typeof e === "object" && e !== null && "__isServerError" in e,
  },
}));

const makeServerError = (statusCode: number) =>
  Object.assign(new Error(`ServerError ${statusCode}`), {
    __isServerError: true,
    statusCode,
  });

const {
  jwtCallback,
  sessionCallback,
  requireSession,
  safeQuery,
  _resetRefreshCacheForTests,
} = await import("./server");

const FIXED_TIME = new Date("2026-04-20T12:00:00Z");
const nowSec = () => Math.floor(FIXED_TIME.getTime() / 1000);

const baseAccount = (overrides: Partial<Account> = {}): Account =>
  ({
    provider: "okta",
    type: "oidc",
    providerAccountId: "u1",
    access_token: "A",
    refresh_token: "R",
    expires_at: nowSec() + 3600,
    ...overrides,
  }) as Account;

describe("jwtCallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_TIME);
    vi.stubEnv("AUTH_OKTA_ISSUER", "https://example.okta.com");
    vi.stubEnv("AUTH_OKTA_ID", "test-client");
  });

  afterEach(() => {
    _resetRefreshCacheForTests();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("initial sign-in passes account.expires_at through untouched when no debug override", async () => {
    const account = baseAccount({ expires_at: nowSec() + 3600 });
    const result = await jwtCallback({ token: {}, account });
    expect(result.accessToken).toBe("A");
    expect(result.refreshToken).toBe("R");
    expect(result.expiresAt).toBeDefined();
    expect(result.expiresAt).toBe(account.expires_at);
    expect(result.error).toBeUndefined();
  });

  test("initial sign-in throws when Okta returns no refresh_token", async () => {
    await expect(
      jwtCallback({
        token: {},
        account: baseAccount({ refresh_token: undefined }),
      }),
    ).rejects.toThrow(/refresh_token/);
  });

  test("returns token unchanged while access token is still valid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const token: JWT = {
      accessToken: "A",
      refreshToken: "R",
      expiresAt: nowSec() + 60,
    };
    const result = await jwtCallback({ token, account: null });
    expect(result).toBe(token);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("flags NoRefreshToken when expired and no refreshToken is stored", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const token: JWT = { accessToken: "A", expiresAt: nowSec() - 10 };
    const result = await jwtCallback({ token, account: null });
    expect(result).toEqual({ ...token, error: "NoRefreshToken" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("refreshes via Okta when expired, updates accessToken and expiresAt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "A2", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token: JWT = {
      accessToken: "A",
      refreshToken: "R",
      expiresAt: nowSec() - 10,
    };
    const result = await jwtCallback({ token, account: null });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: URLSearchParams },
    ];
    expect(url).toBe("https://example.okta.com/oauth2/v1/token");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(init.body.get("grant_type")).toBe("refresh_token");
    expect(init.body.get("refresh_token")).toBe("R");
    expect(init.body.get("client_id")).toBe("test-client");
    expect(init.body.get("scope")).toBe(
      "openid profile email offline_access",
    );

    expect(result).toEqual({
      accessToken: "A2",
      refreshToken: "R",
      expiresAt: nowSec() + 3600,
      error: undefined,
    });
  });

  test("keeps the old refresh token when Okta omits a new one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "A2", expires_in: 3600 }),
      }),
    );
    const result = await jwtCallback({
      token: { accessToken: "A", refreshToken: "R", expiresAt: nowSec() - 10 },
      account: null,
    });
    expect(result.refreshToken).toBe("R");
  });

  test("rotates the refresh token when Okta returns a new one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "A2",
          refresh_token: "R2",
          expires_in: 3600,
        }),
      }),
    );
    const result = await jwtCallback({
      token: { accessToken: "A", refreshToken: "R", expiresAt: nowSec() - 10 },
      account: null,
    });
    expect(result.refreshToken).toBe("R2");
  });

  test("successful refresh clears a prior RefreshAccessTokenError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "A2", expires_in: 3600 }),
      }),
    );
    const result = await jwtCallback({
      token: {
        accessToken: "A",
        refreshToken: "R",
        expiresAt: nowSec() - 10,
        error: "RefreshAccessTokenError",
      },
      account: null,
    });
    expect(result.error).toBeUndefined();
  });

  test("flags RefreshAccessTokenError on Okta HTTP error, preserves old tokens", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "invalid_grant" }),
      }),
    );
    const token: JWT = {
      accessToken: "A",
      refreshToken: "R",
      expiresAt: nowSec() - 10,
    };
    const result = await jwtCallback({ token, account: null });
    expect(result).toEqual({ ...token, error: "RefreshAccessTokenError" });
  });

  test("flags RefreshAccessTokenError when fetch itself rejects (e.g. network)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const token: JWT = {
      accessToken: "A",
      refreshToken: "R",
      expiresAt: nowSec() - 10,
    };
    const result = await jwtCallback({ token, account: null });
    expect(result).toEqual({ ...token, error: "RefreshAccessTokenError" });
  });

  test("concurrent refreshes with the same refresh token share a single Okta call", async () => {
    // Okta rotates the refresh token on every successful use. Two concurrent
    // refreshes with the same old refresh token would cause the second to hit
    // `invalid_grant` and leave its session flagged, so the callback must
    // dedupe in-flight refreshes keyed on the refresh token.
    let refreshCalls = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        refreshCalls++;
        if (refreshCalls === 1) {
          return {
            ok: true,
            json: async () => ({
              access_token: "A2",
              refresh_token: "R2",
              expires_in: 3600,
            }),
          };
        }
        return { ok: false, json: async () => ({ error: "invalid_grant" }) };
      }),
    );

    const token: JWT = {
      accessToken: "A",
      refreshToken: "R",
      expiresAt: nowSec() - 10,
    };
    const [a, b] = await Promise.all([
      jwtCallback({ token, account: null }),
      jwtCallback({ token, account: null }),
    ]);

    expect(refreshCalls).toBe(1);
    expect(a.accessToken).toBe("A2");
    expect(b.accessToken).toBe("A2");
    expect(a.refreshToken).toBe("R2");
    expect(b.refreshToken).toBe("R2");
    expect(a.error).toBeUndefined();
    expect(b.error).toBeUndefined();
  });

  test("concurrent refreshes with different refresh tokens don't block each other", async () => {
    // Regression guard: dedup must be keyed on refresh token, not global.
    // Two separate sessions refreshing in parallel must both hit Okta.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "A2", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([
      jwtCallback({
        token: {
          accessToken: "A",
          refreshToken: "R1",
          expiresAt: nowSec() - 10,
        },
        account: null,
      }),
      jwtCallback({
        token: {
          accessToken: "B",
          refreshToken: "R2",
          expiresAt: nowSec() - 10,
        },
        account: null,
      }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("a failed refresh clears the inflight entry so the next attempt retries", async () => {
    // If the shared promise stayed in the cache after a failure, a follow-up
    // refresh for the same token would re-use the cached rejection forever.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "invalid_grant" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "A2", expires_in: 3600 }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const token: JWT = {
      accessToken: "A",
      refreshToken: "R",
      expiresAt: nowSec() - 10,
    };
    const first = await jwtCallback({ token, account: null });
    expect(first.error).toBe("RefreshAccessTokenError");

    const second = await jwtCallback({ token, account: null });
    expect(second.error).toBeUndefined();
    expect(second.accessToken).toBe("A2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS overrides expires_at on initial sign-in", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS", "30");
    const result = await jwtCallback({
      token: {},
      account: baseAccount({ expires_at: nowSec() + 9_999_999 }),
    });
    expect(result.expiresAt).toBe(nowSec() + 30);
  });

  test("NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS overrides expires_in on refresh", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_DEBUG_TTL_SECONDS", "30");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "A2", expires_in: 9_999_999 }),
      }),
    );
    const result = await jwtCallback({
      token: { accessToken: "A", refreshToken: "R", expiresAt: nowSec() - 10 },
      account: null,
    });
    expect(result.expiresAt).toBe(nowSec() + 30);
  });
});

describe("sessionCallback", () => {
  const baseSession = (): Session =>
    ({
      user: { email: "u@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
    }) as Session;

  test("copies accessToken onto session", async () => {
    const result = await sessionCallback({
      session: baseSession(),
      token: { accessToken: "A" } as JWT,
    });
    expect(result.accessToken).toBe("A");
  });

  test("copies error onto session when token.error is set", async () => {
    const result = await sessionCallback({
      session: baseSession(),
      token: { accessToken: "A", error: "NoRefreshToken" } as JWT,
    });
    expect(result.error).toBe("NoRefreshToken");
  });

  test("leaves session.error undefined when token has no error", async () => {
    const result = await sessionCallback({
      session: baseSession(),
      token: { accessToken: "A" } as JWT,
    });
    expect(result.error).toBeUndefined();
  });
});

describe("requireSession", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockRedirect.mockClear();
  });

  test("returns the session when user is present and no error", async () => {
    const session = {
      user: { email: "u@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
    } as Session;
    mockAuth.mockResolvedValue(session);

    const result = await requireSession();

    expect(result).toBe(session);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  test("redirects to /login when auth() returns null", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  test("redirects to /login when session has no user", async () => {
    mockAuth.mockResolvedValue({
      expires: "2099-01-01T00:00:00.000Z",
    } as Session);
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  test("redirects to /login on NoRefreshToken error (session is unrecoverable)", async () => {
    mockAuth.mockResolvedValue({
      user: { email: "u@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
      error: "NoRefreshToken",
    } as Session);
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mockRedirect).toHaveBeenCalledWith("/login");
  });

  test("returns the session on RefreshAccessTokenError so the caller can decide how to render it", async () => {
    // RefreshAccessTokenError is recoverable on the next request — the package
    // surfaces it on session.error so the page can show a warning instead of
    // forcing a re-login.
    const session = {
      user: { email: "u@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
      error: "RefreshAccessTokenError",
    } as Session;
    mockAuth.mockResolvedValue(session);

    const result = await requireSession();

    expect(result).toBe(session);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  test("return type narrows error to undefined | 'RefreshAccessTokenError' (not 'NoRefreshToken')", async () => {
    const session = {
      user: { email: "u@example.com" },
      expires: "2099-01-01T00:00:00.000Z",
      error: "RefreshAccessTokenError" as const,
    } as Session;
    mockAuth.mockResolvedValue(session);

    const result = await requireSession();

    // Narrowed type check: `result.error` should accept "RefreshAccessTokenError"
    // or be undefined. Assigning "NoRefreshToken" to this variable must be a
    // type error. We assert the runtime value here; the type assertion below
    // is what fails to compile if the narrowing regresses.
    const narrow: "RefreshAccessTokenError" | undefined = result.error;
    expect(narrow).toBe("RefreshAccessTokenError");
  });
});

describe("safeQuery", () => {
  // These tests cover runtime behavior. The `query: {} as never` casts bypass
  // safeQuery's `ApolloClientType.QueryOptions<TData, TVariables>` parameter
  // because the document's shape doesn't matter at runtime — type safety is
  // enforced at real call sites where a TypedDocumentNode flows in.
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test("returns ok:true with data when the underlying query resolves", async () => {
    mockQuery.mockResolvedValue({ data: { hello: "world" } });
    const result = await safeQuery({ query: {} as never });
    expect(result).toEqual({ ok: true, data: { hello: "world" } });
  });

  test("forwards query and variables to the underlying query()", async () => {
    mockQuery.mockResolvedValue({ data: { x: 1 } });
    const document = {} as never;
    await safeQuery({ query: document, variables: { id: "abc" } });
    expect(mockQuery).toHaveBeenCalledWith({
      query: document,
      variables: { id: "abc" },
    });
  });

  test("returns ok:false for a ServerError 401 (stale-token fallback path)", async () => {
    const err = makeServerError(401);
    mockQuery.mockRejectedValue(err);
    const result = await safeQuery({ query: {} as never });
    expect(result).toEqual({
      ok: false,
      reason: "stale-token-401",
      error: err,
    });
  });

  test("re-throws a ServerError that isn't 401 (real upstream error)", async () => {
    const err = makeServerError(500);
    mockQuery.mockRejectedValue(err);
    await expect(safeQuery({ query: {} as never })).rejects.toBe(err);
  });

  test("re-throws a plain Error — not a stale-token case", async () => {
    // An agent wrapping a query with a validation bug should see the bug,
    // not get a silent `{ ok: false }` that renders a CSR fallback.
    const err = new Error("Validation failed");
    mockQuery.mockRejectedValue(err);
    await expect(safeQuery({ query: {} as never })).rejects.toBe(err);
  });

  test("re-throws a non-Error thrown value", async () => {
    mockQuery.mockRejectedValue("plain string");
    await expect(safeQuery({ query: {} as never })).rejects.toBe("plain string");
  });

  test("ok:true narrows data to TData (not undefined) so callers can drop optional chaining", async () => {
    mockQuery.mockResolvedValue({ data: { hello: "world" } });
    const result = await safeQuery<{ hello: string }>({ query: {} as never });
    if (!result.ok) throw new Error("expected ok");
    // If the type were `TData | undefined` this line would need `result.data?.hello`.
    expect(result.data.hello).toBe("world");
  });

  test("throws a loud error when Apollo returns data:undefined without throwing", async () => {
    // In practice Apollo's query() throws on GraphQL errors, so data:undefined
    // without an error indicates a malformed upstream response. Surface it
    // instead of returning ok:true with data:undefined (which the previous
    // type signature allowed).
    mockQuery.mockResolvedValue({ data: undefined });
    await expect(safeQuery({ query: {} as never })).rejects.toThrow(
      /safeQuery: Apollo returned no data/,
    );
  });
});
