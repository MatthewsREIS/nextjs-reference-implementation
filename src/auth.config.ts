import type { NextAuthConfig } from "next-auth";

// Edge-safe subset of the Auth.js config. `proxy.ts` (Next.js 16's renamed
// middleware) imports this module, which MUST NOT pull in Node-only code
// such as the full Okta provider.
export default {
  providers: [], // populated in ./auth.ts
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      if (isOnLogin) return true;
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
