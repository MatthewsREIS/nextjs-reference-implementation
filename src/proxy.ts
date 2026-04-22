import proxyHandler from "@/lib/matthews-graphql/proxy";

// Re-export the edge-safe auth handler as the named `proxy` export. Next.js 16
// requires the proxy function to be either `export default` or named `proxy`
// in this exact file, and re-exported defaults aren't recognised by the
// static analyser — hence the `const` indirection.
export const proxy = proxyHandler;

// NOTE: Server Functions submitted from a matcher-excluded route also bypass
// this proxy — Next.js routes them as POSTs to the host page. Authoritative
// auth checks for sensitive actions must live in the action itself (or the
// RSC that hosts the form), not here.
// Every excluded prefix ends with `(?:$|/)` so the lookahead only fires on a
// full path segment. Without the boundary, `login` would also exclude a
// future `/login-help` route from the gate, silently making it public.
// Matcher MUST be a literal — Next.js 16's static analyser ignores variable
// references.
export const config = {
  matcher: [
    "/((?!api/auth(?:$|/)|_next/static(?:$|/)|_next/image(?:$|/)|favicon\\.ico$|login(?:$|/)|logged-out(?:$|/)).*)",
  ],
};
