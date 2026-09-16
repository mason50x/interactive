"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";

const DAY = 86_400_000;
export function useGamePopularity() {
  const { isAuthenticated } = useConvexAuth();
  const [day, setDay] = useState(() => Math.floor(Date.now() / DAY));
  useEffect(() => {
    const timer = setTimeout(
      () => setDay(Math.floor(Date.now() / DAY)),
      (day + 1) * DAY - Date.now() + 100,
    );
    return () => clearTimeout(timer);
  }, [day]);
  return useQuery(api.gameViews.popularity, isAuthenticated ? { day } : "skip");
}

export function GameViewRecorder({ slug }: { slug: string }) {
  const { isAuthenticated } = useConvexAuth();
  const record = useMutation(api.gameViews.record);
  useEffect(() => {
    if (isAuthenticated)
      void record({ slug }).catch((error) =>
        console.warn("Game view could not be recorded", error),
      );
  }, [isAuthenticated, record, slug]);
  return null;
}
