import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Account, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

// `./auth` calls NextAuth() at module load to build the real handlers.
// Stub the factory out so importing this file doesn't drag in next-auth's
// runtime (which currently has a `next/server` resolution mismatch against
// Next 16). The callbacks we want to test are defined as plain named
// exports, so they're unaffected by the stub.
vi.mock("next-auth", () => ({
  default: () => ({
    handlers: {},
    auth: () => undefined,
    signIn: () => undefined,
    signOut: () => undefined,
  }),
}));
vi.mock("next-auth/providers/okta", () => ({
  default: () => ({ id: "okta" }),
}));
vi.mock("@apollo/client-integration-nextjs", () => ({
  registerApolloClient: (fn: () => unknown) => ({ query: vi.fn(), PreloadQuery: vi.fn(), getClient: fn }),
  ApolloClient: vi.fn().mockImplementation(() => ({})),
  InMemoryCache: vi.fn().mockImplementation(() => ({})),
}));
vi.mock("@apollo/client", () => ({
  HttpLink: vi.fn().mockImplementation(() => ({})),
}));

const { jwtCallback, sessionCallback, _resetRefreshCacheForTests } =
  await import("./server");

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
