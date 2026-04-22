import { signIn } from "@/lib/matthews-graphql/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AutoSubmit } from "./auto-submit";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            You&rsquo;ll be redirected to Okta to authenticate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              "use server";
              await signIn("okta", { redirectTo: "/" });
            }}
          >
            <AutoSubmit>Sign in with Okta</AutoSubmit>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
