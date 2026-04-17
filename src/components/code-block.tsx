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
  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      )}
      <pre
        className={cn(
          "overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed",
          className,
        )}
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}
