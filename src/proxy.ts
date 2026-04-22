import proxyHandler from "@/lib/matthews-graphql/proxy";

export const proxy = proxyHandler;

export const config = {
  matcher: [
    "/((?!api/auth(?:$|/)|_next/static(?:$|/)|_next/image(?:$|/)|favicon\\.ico$|login(?:$|/)|logged-out(?:$|/)).*)",
  ],
};
