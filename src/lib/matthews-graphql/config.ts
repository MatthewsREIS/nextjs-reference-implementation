import type { NextAuthConfig } from "next-auth";

// Edge-safe subset of the Auth.js config. `proxy.ts` (Next.js 16's renamed
// middleware) imports this module, which MUST NOT pull in Node-only code
// such as the full Okta provider.
export const authConfig: NextAuthConfig = {
  providers: [], // populated in ./server
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      if (isOnLogin) return true;
      // A session whose refresh token can never be recovered is effectively
      // dead — bounce to /login so the user re-authenticates cleanly instead
      // of lingering in a half-broken state where every API call 401s.
      if (auth?.error === "NoRefreshToken") return false;
      return !!auth?.user;
    },
  },
};
