import type { ReactNode } from "react";
import { auth } from "./server";
import { MatthewsGraphqlProviderClient } from "./provider-client";

// Async React Server Component: reads the session on the server so
// SessionProvider hydrates with it and the Apollo authLink has the access
// token on the very first client render — no /api/auth/session round-trip on
// hydrate. Builders only ever write `<MatthewsGraphqlProvider>{children}
// </MatthewsGraphqlProvider>` in layout.tsx; everything else is internal.
export async function MatthewsGraphqlProvider({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  return (
    <MatthewsGraphqlProviderClient session={session}>
      {children}
    </MatthewsGraphqlProviderClient>
  );
}
