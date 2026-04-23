"use server";

import { revalidatePath } from "next/cache";
import {
  mutate,
  requireSession,
} from "@/lib/matthews-graphql/server";
import { UPDATE_CALENDAR_URL_NOOP_MUTATION } from "@/graphql/examples";

type UpdateCalendarUrlResult = {
  UpdateUserSettings: { calendarURL: string | null };
};

/**
 * Server Action driving Card 8 on the home page. Demonstrates the canonical
 * recipe for a mutation invoked from a `<form action={...}>`:
 *
 *   1. `requireSession()` to gate the action — Server Actions re-check auth
 *      because the proxy matcher doesn't intercept them.
 *   2. `mutate()` from `@/lib/matthews-graphql/server` — Node-only, routes
 *      through the RSC Apollo client (which attaches the bearer header and
 *      refreshes on every request).
 *   3. `revalidatePath("/")` so the home page's RSC re-fetches the
 *      corresponding query and re-renders with the new value.
 *
 * Returns `{ ok: true, calendarURL }` on success so the calling client
 * component can flip a "saved" flag. Errors propagate — Next.js surfaces them
 * through the nearest error boundary; the client wrapper can also catch on
 * the returned promise if it uses `useActionState` instead of form actions.
 */
export async function updateCalendarUrlAction(
  _prevState: unknown,
  formData: FormData,
): Promise<{ ok: true; calendarURL: string | null }> {
  await requireSession();

  const raw = formData.get("calendarURL");
  // Empty string → null so we write the "unset" state back unchanged; matches
  // the demo contract of Card 5 (re-save the current value, including null).
  const calendarURL =
    typeof raw === "string" && raw.length > 0 ? raw : null;

  const data = await mutate<UpdateCalendarUrlResult>({
    mutation: UPDATE_CALENDAR_URL_NOOP_MUTATION,
    variables: { calendarURL },
  });

  // Re-run the home RSC so Card 1 / Card 8's server-rendered values reflect
  // the new state. `revalidatePath` is the canonical way to invalidate RSC
  // caches from a Server Action.
  revalidatePath("/");

  return { ok: true, calendarURL: data.UpdateUserSettings.calendarURL };
}
