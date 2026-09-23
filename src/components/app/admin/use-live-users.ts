"use client";

import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";

const LIVE_WINDOW_MS = 60_000;

export function useLiveUsers() {
  const [cutoff, setCutoff] = useState(() => Date.now() - LIVE_WINDOW_MS);
  useEffect(() => {
    const timer = setInterval(
      () => setCutoff(Date.now() - LIVE_WINDOW_MS),
      10_000,
    );
    return () => clearInterval(timer);
  }, []);
  return useAuthedQuery(api.timeouts.liveUsers, { cutoff });
}
