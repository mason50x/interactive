"use client";
import { useMemo } from "react";
import { CatalogueBrowser } from "@/components/app/catalogue-browser";
import { useGamePopularity } from "@/components/app/game-views";
import { gameViewLabel, rankGames } from "@/lib/game-popularity";
import { useActivities } from "@/components/app/activities-provider";
import { ActivityGrid } from "@/components/app/activities/activity-grid";

export function ActivitiesBrowser() {
  const catalogue = useActivities();
  const popularity = useGamePopularity();
  const ranked = useMemo(
    () => rankGames(catalogue, popularity ?? []),
    [catalogue, popularity],
  );
  const notes = useMemo(() => {
    const counts = new Map(
      popularity?.map((row) => [row.slug, row.weeklyViews]),
    );
    return Object.fromEntries(
      ranked.map((game, index) => {
        const views = counts.get(game.slug) ?? 0;
        return [
          game.slug,
          popularity === undefined
            ? "Loading views…"
            : gameViewLabel(views, views > 0 ? index + 1 : undefined),
        ];
      }),
    );
  }, [ranked, popularity]);
  return (
    <CatalogueBrowser
      catalogue={catalogue}
      ranked={ranked}
      renderGrid={(shown) => <ActivityGrid shown={shown} notes={notes} />}
    />
  );
}
