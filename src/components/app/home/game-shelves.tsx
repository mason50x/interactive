"use client";

import { useMemo, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useActivities } from "@/components/app/activities-provider";
import { useGamePopularity } from "@/components/app/game-views";
import { SegmentedControl } from "@/components/ui/segmented";
import { rankGames } from "@/lib/game-popularity";
import { GameCarousel } from "./game-carousel";
import { HomeCards } from "./home-cards";
import styles from "./home.module.css";

const MODES = [
  { value: "suggestions", label: "Suggestions" },
  { value: "recent", label: "Jump back in" },
] as const;
export function GameShelves() {
  const catalogue = useActivities();
  const { isAuthenticated } = useConvexAuth();
  const recent = useQuery(api.gameViews.recent, isAuthenticated ? {} : "skip");
  const popularity = useGamePopularity();
  const [mode, setMode] = useState<"suggestions" | "recent">("suggestions");
  const suggestions = useMemo(() => {
    // Until views exist, editorial catalogue order supplies useful suggestions.
    const ranked = popularity?.some((row) => row.views > 0)
      ? rankGames(catalogue, popularity)
      : catalogue;
    return ranked.slice(0, 10);
  }, [catalogue, popularity]);
  const recentGames = useMemo(() => {
    const bySlug = new Map(catalogue.map((game) => [game.slug, game]));
    return (recent ?? []).flatMap((row) => {
      const game = bySlug.get(row.slug);
      return game ? [game] : [];
    });
  }, [catalogue, recent]);
  return (
    <div className={styles.layout}>
      <div className="min-w-0">
        <SegmentedControl
          aria-label="Choose games"
          value={mode}
          onValueChange={setMode}
          options={MODES}
          className="w-fit"
        />
        <GameCarousel
          key={mode}
          games={mode === "recent" ? recentGames : suggestions}
          loading={
            mode === "recent" ? recent === undefined : popularity === undefined
          }
          recent={mode === "recent"}
        />
      </div>
      <HomeCards />
    </div>
  );
}
