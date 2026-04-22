import NextAuth from "next-auth";
import { authConfig } from "./config";

// Edge-safe Auth.js instance for Next.js 16's proxy (ex-middleware). MUST
// NOT transitively import `./server` — that module pulls in the Okta
// provider which depends on Node-only crypto. The consumer's `src/proxy.ts`
// is the filesystem-pinned file Next.js statically analyses; it inlines the
// matcher literal there (Next.js requires it) and imports only this default
// export as its proxy handler.
const { auth } = NextAuth(authConfig);

export default auth;
