"use client";

import { useEffect, useState } from "react";

// `value`, but only after it has stopped changing for `delayMs` — so typing in a search
// box sends one request when you pause, not one per keystroke.
export function useDebouncedValue<Value>(value: Value, delayMs = 300): Value {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
