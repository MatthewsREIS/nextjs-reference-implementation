import { auth } from "@/auth";
import { query } from "@/lib/apollo/server";
import { EXAMPLE_QUERY } from "@/graphql/example";
import { SignOutButton } from "@/components/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function Home() {
  // proxy.ts has already gated this route, but re-check here to satisfy
  // Next.js' recommendation to treat session auth as a page-level concern.
  const session = await auth();

  const { data, error } = await query({ query: EXAMPLE_QUERY }).catch(
    (err: unknown) => ({ data: null, error: err }),
  );

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Hello, {session?.user?.name ?? session?.user?.email ?? "there"}
        </h1>
        <SignOutButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Artemis sample query</CardTitle>
          <CardDescription>
            Fetched from <code>ARTEMIS_GRAPHQL_URL</code> with the Okta access
            token attached as a Bearer header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <pre className="text-sm text-destructive">
              {error instanceof Error ? error.message : String(error)}
            </pre>
          ) : (
            <pre className="text-sm overflow-x-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {session?.error && (
        <Card>
          <CardHeader>
            <CardTitle>Session warning</CardTitle>
            <CardDescription>{session.error}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </main>
  );
}
