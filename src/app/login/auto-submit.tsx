"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Visible submit button that auto-clicks itself once on mount. Users with
// JavaScript get an instant Okta redirect; users without JS (or where
// hydration fails) still see and can click a real, accessible button.
export function AutoSubmit({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.click();
  }, []);
  return (
    <button
      ref={ref}
      type="submit"
      className={cn(buttonVariants(), "w-full")}
    >
      {children}
    </button>
  );
}
