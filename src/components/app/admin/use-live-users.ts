"use client";

import { useEffect, useState } from "react";
import { useConvexAuth } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";

const LIVE_WINDOW_MS = 60_000;

export function useLiveUsers() {
  const { isAuthenticated } = useConvexAuth();
  const [cutoff, setCutoff] = useState(() => Date.now() - LIVE_WINDOW_MS);
  const [lastResult, setLastResult] =
    useState<
      ReturnType<typeof useAuthedQuery<typeof api.timeouts.liveUsers>>
    >();
  useEffect(() => {
    const timer = setInterval(
      () => setCutoff(Date.now() - LIVE_WINDOW_MS),
      10_000,
    );
    return () => clearInterval(timer);
  }, []);
  const result = useAuthedQuery(api.timeouts.liveUsers, { cutoff });
  if (!isAuthenticated && lastResult !== undefined) setLastResult(undefined);
  else if (result !== undefined && result !== lastResult) setLastResult(result);
  // Changing the cutoff starts a new subscription. Keep the prior snapshot
  // visible until that subscription delivers its first result.
  return isAuthenticated ? (result ?? lastResult) : undefined;
}
