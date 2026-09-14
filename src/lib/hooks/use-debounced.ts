import { useEffect, useState } from "react";

/**
 * A value, `delay` milliseconds behind the one it was given.
 *
 * For a search box feeding a query: the box updates on every keystroke, the
 * query waits for the typing to pause. The returned value starts equal to the
 * first one it sees, so nothing renders an empty step before the first tick.
 *
 * Every timer is cleared on the next change or on unmount, which is what makes
 * it safe to hand the result straight to a subscription.
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
