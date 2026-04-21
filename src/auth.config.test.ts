import { describe, expect, test } from "vitest";
import type { Session } from "next-auth";
import type { NextRequest } from "next/server";
import authConfig from "./auth.config";

const authorized = authConfig.callbacks!.authorized!;

function call(auth: Session | null, pathname: string) {
  return authorized({
    auth,
    request: { nextUrl: { pathname } } as unknown as NextRequest,
  } as Parameters<typeof authorized>[0]);
}

const userSession = (overrides: Partial<Session> = {}): Session =>
  ({
    user: { id: "u1", email: "u@example.com" },
    expires: "2099-01-01T00:00:00.000Z",
    ...overrides,
  }) as Session;

describe("authorized", () => {
  test("denies unauthenticated request to protected path", () => {
    expect(call(null, "/")).toBe(false);
  });

  test("allows authenticated request to protected path", () => {
    expect(call(userSession(), "/")).toBe(true);
  });

  test("always allows /login, authenticated or not", () => {
    expect(call(null, "/login")).toBe(true);
    expect(call(userSession(), "/login")).toBe(true);
  });

  test("allows any path starting with /login", () => {
    expect(call(null, "/login/continue")).toBe(true);
  });

  test("denies session flagged with NoRefreshToken even if user is present", () => {
    expect(call(userSession({ error: "NoRefreshToken" }), "/")).toBe(false);
  });

  test("allows session flagged with RefreshAccessTokenError (self-heals on retry)", () => {
    expect(call(userSession({ error: "RefreshAccessTokenError" }), "/")).toBe(
      true,
    );
  });
});
