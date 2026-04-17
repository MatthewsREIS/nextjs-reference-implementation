import { HttpLink } from "@apollo/client";
import {
  registerApolloClient,
  ApolloClient,
  InMemoryCache,
} from "@apollo/client-integration-nextjs";
import { auth } from "@/auth";

// One ApolloClient per request in RSC, with the Okta access_token attached.
// `registerApolloClient` ensures the same instance is reused within a single
// request and a fresh one is built per request — required for token isolation.
export const { getClient, query, PreloadQuery } = registerApolloClient(() => {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: process.env.GRAPHQL_API_URL,
      fetch: async (input, init) => {
        const session = await auth();
        const headers = new Headers(init?.headers);
        if (session?.accessToken) {
          headers.set("Authorization", `Bearer ${session.accessToken}`);
        }
        return fetch(input, { ...init, headers });
      },
    }),
  });
});
