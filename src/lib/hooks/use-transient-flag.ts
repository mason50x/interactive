import { useCallback, useEffect, useState } from "react";

/**
 * A flag that raises itself on demand and lowers itself `ms` later.
 *
 * The shape of a receipt: "Sent", "Copied", a highlight that should be seen
 * and then get out of the way. Raising it again restarts the clock, and the
 * timer is cleared on unmount so nothing sets state on a component that has
 * gone.
 */
export function useTransientFlag(ms: number): [boolean, () => void] {
  const [raised, setRaised] = useState(false);

  useEffect(() => {
    if (!raised) return;
    const timer = window.setTimeout(() => setRaised(false), ms);
    return () => window.clearTimeout(timer);
  }, [raised, ms]);

  const raise = useCallback(() => setRaised(true), []);

  return [raised, raise];
}
