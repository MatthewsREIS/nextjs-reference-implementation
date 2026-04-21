"use client";

import { useState } from "react";
import { AlertCircle, Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "error";

const COPY_ERROR_LABEL = "Copy failed — select manually";

export function CodeBlock({
  children,
  label,
  className,
}: {
  children: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setState("copied");
      setTimeout(() => setState("idle"), 1500);
    } catch (e) {
      // Clipboard can be blocked (permissions policy, non-secure context).
      // Surface the failure so screen readers and sighted users both know
      // the code is still in the <pre> above, not on the clipboard.
      console.error("[code-block] clipboard write failed:", e);
      setState("error");
    }
  };

  const buttonLabel =
    state === "copied"
      ? "Copied"
      : state === "error"
        ? COPY_ERROR_LABEL
        : "Copy to clipboard";

  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      )}
      <div className="relative">
        <pre
          className={cn(
            "overflow-x-auto rounded-md bg-muted p-3 pr-10 text-xs leading-relaxed",
            className,
          )}
        >
          <code>{children}</code>
        </pre>
        <button
          type="button"
          onClick={onCopy}
          aria-label={buttonLabel}
          className={cn(
            "absolute right-2 top-2 rounded-md p-1.5 transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            state === "error"
              ? "text-destructive hover:text-destructive"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {state === "copied" ? (
            <Check className="h-3.5 w-3.5" />
          ) : state === "error" ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {state === "copied"
            ? "Copied"
            : state === "error"
              ? COPY_ERROR_LABEL
              : ""}
        </span>
      </div>
    </div>
  );
}
