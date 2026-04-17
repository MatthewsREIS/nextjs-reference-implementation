import NextAuth from "next-auth";
import authConfig from "@/auth.config";

// Next.js 16 renamed `middleware.ts` to `proxy.ts`. We build an edge-safe
// Auth.js instance here (no Okta provider imports) so the `authorized`
// callback in `auth.config.ts` can redirect unauthenticated traffic to
// /login before it ever reaches a Server Component.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|login|logged-out).*)",
  ],
};
