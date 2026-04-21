"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import { print } from "graphql";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";
import {
  CALENDAR_URL_QUERY,
  UPDATE_CALENDAR_URL_NOOP_MUTATION,
} from "@/graphql/examples";
import { useMounted } from "@/lib/use-mounted";

type SettingsData = {
  UserSettings: { calendarURL: string | null } | null;
};

type MutationResult = {
  UpdateUserSettings: { calendarURL: string | null };
};

export function MutationExample() {
  // `mounted` here is NOT for the query (the query runs normally server- and
  // client-side). It gates base-ui's <Button disabled={…}> because the lib
  // serializes the attribute differently across SSR and CSR, which would
  // otherwise show up as a hydration mismatch warning. Rendering the button
  // post-mount sidesteps the divergence. See commit 0fa86c5.
  const mounted = useMounted();

  const {
    data,
    loading: queryLoading,
    error: queryError,
  } = useQuery<SettingsData>(CALENDAR_URL_QUERY);

  const [
    runMutation,
    { loading: mutating, error: mutationError, data: mutationData },
  ] = useMutation<MutationResult>(UPDATE_CALENDAR_URL_NOOP_MUTATION);

  const current = data?.UserSettings?.calendarURL ?? null;

  return (
    <div className="space-y-3">
      <CodeBlock label="Mutation">
        {print(UPDATE_CALENDAR_URL_NOOP_MUTATION)}
      </CodeBlock>

      {queryError && (
        <pre className="text-sm text-destructive">{queryError.message}</pre>
      )}

      <CodeBlock label="Response">
        {mutationData
          ? JSON.stringify(mutationData, null, 2)
          : "// Click “Re-save (no-op)” to run the mutation."}
      </CodeBlock>

      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Rendered
      </p>

      <p className="text-sm">
        Current <code>calendarURL</code>:{" "}
        <span className="font-mono">
          {!mounted || queryLoading
            ? "loading…"
            : JSON.stringify(current)}
        </span>
      </p>

      {mounted && (
        <Button
          size="sm"
          variant="outline"
          disabled={mutating || queryLoading}
          onClick={() =>
            runMutation({ variables: { calendarURL: current } })
          }
        >
          {mutating ? "Saving…" : "Re-save (no-op)"}
        </Button>
      )}

      {mutationError && (
        <pre className="text-sm text-destructive">
          {mutationError.message}
        </pre>
      )}

      {mutationData && (
        <p className="text-sm text-muted-foreground">
          Server returned:{" "}
          <span className="font-mono">
            {JSON.stringify(
              mutationData.UpdateUserSettings?.calendarURL,
            )}
          </span>
        </p>
      )}
    </div>
  );
}
