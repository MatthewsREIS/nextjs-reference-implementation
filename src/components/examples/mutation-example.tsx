"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { print } from "graphql";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";
import {
  CALENDAR_URL_QUERY,
  UPDATE_CALENDAR_URL_NOOP_MUTATION,
} from "@/graphql/examples";

type SettingsData = {
  UserSettings: { calendarURL: string | null } | null;
};

type MutationResult = {
  UpdateUserSettings: { calendarURL: string | null };
};

export function MutationExample() {
  // Gate to avoid hydration mismatch: SSR renders before useQuery resolves,
  // client renders after it's fired. The `disabled` prop would otherwise
  // differ between the two passes.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

      <Button
        size="sm"
        variant="outline"
        disabled={!mounted || mutating || queryLoading}
        onClick={() =>
          runMutation({ variables: { calendarURL: current } })
        }
      >
        {mutating ? "Saving…" : "Re-save (no-op)"}
      </Button>

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
