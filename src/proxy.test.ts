import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

// proxy.ts calls NextAuth() at module load to build an edge middleware.
// We only care about the exported `config.matcher` for this suite, so stub
// out next-auth to avoid pulling the full runtime into the test process.
vi.mock("next-auth", () => ({
  default: () => ({ auth: () => undefined }),
}));

const { config } = await import("./proxy");

const matcherRegex = new RegExp(`^${config.matcher[0]}$`);
const matches = (pathname: string) => matcherRegex.test(pathname);

describe("proxy matcher", () => {
  describe("excludes public paths", () => {
    test.each([
      "/api/auth/callback/okta",
      "/api/auth/session",
      "/login",
      "/login/continue",
      "/logged-out",
      "/favicon.ico",
      "/_next/static/chunks/app.js",
      "/_next/image",
    ])("%s", (p) => {
      expect(matches(p)).toBe(false);
    });
  });

  describe("matches protected paths", () => {
    test.each([
      "/",
      "/dashboard",
      "/settings/profile",
      "/api/trpc/anything",
      "/api/graphql",
      // Segment-boundary guards — these start with an excluded prefix but
      // aren't the prefix itself, so they must stay gated.
      "/logs",
      "/login-help",
      "/logged-out-admin",
      "/api/authorize",
      "/favicon.ico.bak",
    ])("%s", (p) => {
      expect(matches(p)).toBe(true);
    });
  });
});

// A structural safety net: every route we render under src/app/ must either
// be matcher-excluded (and therefore intentionally public) or appear in the
// PROTECTED allow-list below. Adding a new page without updating this list
// fails the test so the security implications have to be considered in the
// same diff as the route.
describe("app route audit", () => {
  const EXCLUDED_PREFIXES = ["/login", "/logged-out"];
  const PROTECTED: ReadonlySet<string> = new Set(["/"]);

  function walkPages(dir: string, base = ""): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip API route handlers — those use `route.ts`, not `page.tsx`,
        // and their gating is covered by the matcher-regex suite above.
        if (entry.name === "api") continue;
        // Route groups `(foo)` don't add a URL segment.
        const segment = entry.name.startsWith("(") ? "" : `/${entry.name}`;
        out.push(...walkPages(full, base + segment));
      } else if (entry.name === "page.tsx") {
        out.push(base || "/");
      }
    }
    return out;
  }

  const appDir = join(process.cwd(), "src/app");
  const discovered = walkPages(appDir);

  test("every page is either matcher-excluded or in the protected allow-list", () => {
    const unaccounted = discovered.filter((route) => {
      const excluded = EXCLUDED_PREFIXES.some(
        (prefix) => route === prefix || route.startsWith(`${prefix}/`),
      );
      return !(excluded || PROTECTED.has(route));
    });
    expect(unaccounted).toEqual([]);
  });

  test("every route in the PROTECTED allow-list is actually matched by the proxy", () => {
    for (const route of PROTECTED) {
      expect(matches(route)).toBe(true);
    }
  });
});
