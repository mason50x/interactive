"use client";
import { FilmIcon } from "@heroicons/react/24/solid";
import { CatalogueBrowser } from "@/components/app/catalogue-browser";
import { CatalogueGrid } from "@/components/app/activities/activity-grid";
import { CatalogueCard } from "@/components/app/catalogue-card";
import { PlaybackHelpButton } from "./entertainment-setup";
import type { TvEntry } from "@/lib/tv-types";

const CATEGORIES = {
  animation: { label: "Animation", hue: "#14b8a6" },
  anime: { label: "Anime", hue: "#8b5cf6" },
};
export function TvBrowser({ shows }: { shows: readonly TvEntry[] }) {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <PlaybackHelpButton />
      </div>
      <CatalogueBrowser
        catalogue={shows}
        ranked={shows}
        noun="Entertainment"
        categories={CATEGORIES}
        defaultSortLabel="Featured"
        renderGrid={(shown) => (
          <CatalogueGrid
            shown={shown}
            renderCard={(show) => (
              <CatalogueCard
                title={show.title}
                href={`/entertainment/${show.slug}`}
                thumbnail={show.thumbnail}
                category={
                  CATEGORIES[show.genre as keyof typeof CATEGORIES].label
                }
                hueColor={CATEGORIES[show.genre as keyof typeof CATEGORIES].hue}
                icon={FilmIcon}
                note={`${show.episodeCount} episodes · Season 1`}
              />
            )}
          />
        )}
      />
    </>
  );
}
