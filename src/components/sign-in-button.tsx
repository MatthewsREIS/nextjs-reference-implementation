import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";

export function SignInButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("okta", { redirectTo: "/" });
      }}
    >
      <Button type="submit" size="lg" className="w-full">
        Sign in with Okta
      </Button>
    </form>
  );
}
