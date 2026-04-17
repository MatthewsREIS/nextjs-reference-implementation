"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import { print } from "graphql";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/code-block";
import {
  UPDATE_COMMITMENTS_NOOP_MUTATION,
  WEEKLY_CALL_COMMITMENT_QUERY,
} from "@/graphql/examples";

type ViewerData = {
  viewer: { id: string; weeklyCallCommitment: number | null } | null;
};

type MutationResult = {
  UpdateUserSettings: { weeklyCallCommitment: number | null };
};

export function MutationExample() {
  const {
    data,
    loading: queryLoading,
    error: queryError,
  } = useQuery<ViewerData>(WEEKLY_CALL_COMMITMENT_QUERY);

  const [
    runMutation,
    { loading: mutating, error: mutationError, data: mutationData },
  ] = useMutation<MutationResult>(UPDATE_COMMITMENTS_NOOP_MUTATION);

  const current = data?.viewer?.weeklyCallCommitment ?? null;

  return (
    <div className="space-y-3">
      <CodeBlock>{print(UPDATE_COMMITMENTS_NOOP_MUTATION)}</CodeBlock>

      {queryError && (
        <pre className="text-sm text-destructive">{queryError.message}</pre>
      )}

      <p className="text-sm">
        Current <code>weeklyCallCommitment</code>:{" "}
        <span className="font-mono">
          {queryLoading ? "loading…" : String(current)}
        </span>
      </p>

      <Button
        size="sm"
        variant="outline"
        disabled={mutating || current === null}
        onClick={() =>
          current !== null &&
          runMutation({ variables: { weeklyCallCommitment: current } })
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
        <>
          <p className="text-sm text-muted-foreground">
            Server returned:{" "}
            <span className="font-mono">
              {String(mutationData.UpdateUserSettings?.weeklyCallCommitment)}
            </span>
          </p>
          <CodeBlock>{JSON.stringify(mutationData, null, 2)}</CodeBlock>
        </>
      )}
    </div>
  );
}
