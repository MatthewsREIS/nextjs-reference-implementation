"use client";

import { useEffect, useRef } from "react";

export function AutoSubmit() {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.click();
  }, []);
  return <button ref={ref} type="submit" hidden />;
}
