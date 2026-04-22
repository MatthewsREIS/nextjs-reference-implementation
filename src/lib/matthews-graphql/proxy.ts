import NextAuth from "next-auth";
import { authConfig } from "./config";

// Edge-safe Auth.js instance for Next.js 16's proxy (ex-middleware). MUST
// NOT transitively import `./server` — that module pulls in the Okta
// provider which depends on Node-only crypto.
const { auth } = NextAuth(authConfig);

export default auth;

// NOTE: Server Functions submitted from a matcher-excluded route also bypass
// this proxy — Next.js routes them as POSTs to the host page. Authoritative
// auth checks for sensitive actions must live in the action itself (or the
// RSC that hosts the form), not here.
// Every excluded prefix ends with `(?:$|/)` so the lookahead only fires on a
// full path segment. Without the boundary, `login` would also exclude a
// future `/login-help` route from the gate, silently making it public.
export const config = {
  matcher: [
    "/((?!api/auth(?:$|/)|_next/static(?:$|/)|_next/image(?:$|/)|favicon\\.ico$|login(?:$|/)|logged-out(?:$|/)).*)",
  ],
};
