"use client";

import { useActionState } from "react";
import { print } from "graphql";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";
import { UPDATE_CALENDAR_URL_NOOP_MUTATION } from "@/graphql/examples";
import { updateCalendarUrlAction } from "@/actions/update-calendar-url";
import { useMounted } from "@/lib/use-mounted";

type State = { ok: true; calendarURL: string | null } | null;

// Card 8 body: demonstrates a Server Action + `revalidatePath` flow.
// Renders `<form action={useActionState'd action}>` so the server-side work
// runs on submit; the returned state drives the "last saved" readout.
// The RSC parent supplies the `currentValue` (fetched via the same
// `@/lib/matthews-graphql/server` helpers), which becomes the form's
// initial input value.
export function ServerActionExample({
  currentValue,
}: {
  currentValue: string | null;
}) {
  // `mounted` gates the base-ui <Button disabled={...}> attribute because the
  // lib serialises `disabled` differently between SSR and CSR. Same pattern
  // as `MutationExample` — the query/action themselves don't need a mount
  // gate; only the hydration-sensitive UI does.
  const mounted = useMounted();
  const [state, formAction, pending] = useActionState<State, FormData>(
    updateCalendarUrlAction,
    null,
  );

  return (
    <div className="space-y-3">
      <CodeBlock label="Mutation (via server action)">
        {print(UPDATE_CALENDAR_URL_NOOP_MUTATION)}
      </CodeBlock>

      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Rendered
      </p>

      <p className="text-sm">
        Server-side current <code>calendarURL</code>:{" "}
        <span className="font-mono">{JSON.stringify(currentValue)}</span>
      </p>

      <form action={formAction} className="flex items-center gap-2">
        <input
          type="hidden"
          name="calendarURL"
          value={currentValue ?? ""}
        />
        {mounted && (
          <Button size="sm" variant="outline" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Re-save via server action"}
          </Button>
        )}
      </form>

      {state?.ok && (
        <p className="text-sm text-muted-foreground">
          Action returned:{" "}
          <span className="font-mono">
            {JSON.stringify(state.calendarURL)}
          </span>
          {" — "}
          <code>revalidatePath(&quot;/&quot;)</code> re-rendered the RSC above.
        </p>
      )}
    </div>
  );
}
