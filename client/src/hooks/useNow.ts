"use client";

import { useEffect, useState } from "react";

// The current time, read only after mount (null on the server render) so markup that
// depends on "now" — overdue badges, "due today" — never causes a hydration mismatch.
// Refreshes every minute so a task turns overdue without a reload.
export function useNow(refreshMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs]);
  return now;
}
