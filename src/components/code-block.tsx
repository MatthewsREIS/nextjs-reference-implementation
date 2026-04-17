"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CodeBlock({
  children,
  label,
  className,
}: {
  children: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be blocked by permissions or non-secure contexts.
      // Fail silently — the code is still visible for manual selection.
    }
  };

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
          aria-label={copied ? "Copied" : "Copy to clipboard"}
          className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
