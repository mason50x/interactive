import type { ActivityEntry } from "./activity";

export type GamePopularity = {
  slug: string;
  views: number;
  weeklyViews: number;
};

export function rankGames(
  catalogue: readonly ActivityEntry[],
  stats: readonly GamePopularity[],
) {
  const bySlug = new Map(stats.map((row) => [row.slug, row]));
  return [...catalogue].sort(
    (a, b) =>
      (bySlug.get(b.slug)?.weeklyViews ?? 0) -
        (bySlug.get(a.slug)?.weeklyViews ?? 0) ||
      (bySlug.get(b.slug)?.views ?? 0) - (bySlug.get(a.slug)?.views ?? 0) ||
      a.title.localeCompare(b.title) ||
      a.slug.localeCompare(b.slug),
  );
}

export function gameViewLabel(views: number, rank?: number) {
  return `${rank ? `#${rank} · ` : ""}${views.toLocaleString()} ${views === 1 ? "view" : "views"} in the last 7 days`;
}
