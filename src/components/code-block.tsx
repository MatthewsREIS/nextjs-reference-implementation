import { cn } from "@/lib/utils";

export function CodeBlock({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed",
        className,
      )}
    >
      <code>{children}</code>
    </pre>
  );
}
