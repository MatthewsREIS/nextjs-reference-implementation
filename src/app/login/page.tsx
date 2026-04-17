import { signIn } from "@/auth";
import { AutoSubmit } from "./auto-submit";

export default function LoginPage() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("okta", { redirectTo: "/" });
      }}
    >
      <AutoSubmit />
    </form>
  );
}
