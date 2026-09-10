"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { useDeferredValue, useMemo, useState } from "react";
import { ActivityGrid } from "@/components/app/activities/activity-grid";
import { CategoryMenu } from "@/components/app/activities/category-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, InputAddon, InputGroup } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { type Activity, filterActivities, type Genre } from "@/lib/activity";
import { GENRES } from "@/lib/genres";
import { cn } from "@/lib/utils";

/**
 * The catalogue, as the dashboard browses it: a filter bar over one grid.
 *
 * A grid and not six sideways shelves. A shelf is the right shape when you are
 * being shown a selection — the home page still uses one — but this page is
 * where you come to find something, and a horizontal scroller hides most of
 * its contents behind a gesture. Reaction alone was 130 activities down a
 * single row. Here every card is on the page and the only motion is the one
 * the window already does.
 *
 * Filtering never changes the shape of the page. A query and a category both
 * do the same thing — narrow which cards survive — and the grid reflows under
 * whatever is left, so there is no separate results view to design and no
 * layout that appears only when you type.
 *
 * The catalogue arrives as a prop rather than as an import, and that is a
 * boundary, not a style choice. Importing it here would put all 318 entries
 * into a `/_next/static` chunk, which is served with no session in front of it
 * — the route would be gated and the data would not. As a prop it travels in
 * this page's RSC payload instead, behind the same `auth.protect()` as
 * everything else on it. See `src/lib/activities.ts`.
 *
 * What does not change is the filtering: the whole catalogue is still in the
 * browser once the page has loaded — six short fields per activity, about
 * 10 KB gzipped — so search stays instant and local. No route handler, no
 * request per keystroke, no loading state to design.
 *
 * The 318 thumbnails are *not* eagerly loaded. Every `<img>` is lazy, and in a
 * vertical grid the ones below the fold are genuinely off-screen, so an
 * untouched page pays for the first two rows.
 *
 * This file is the shell: the state, what is derived from it, and the bar.
 * The category menu and the grid are their own files under `activities/`.
 */

type Sort = "popular" | "title";

/** Popular or alphabetical, as a two-stop segmented control. */
const SORTS: readonly { value: Sort; label: string }[] = [
  { value: "popular", label: "Popular" },
  { value: "title", label: "A–Z" },
];

export function ActivitiesBrowser({
  activities: catalogue,
}: {
  activities: readonly Activity[];
}) {
  // This page's own string, not the rail's. The two used to be one, and typing
  // here filled the rail's box and opened it too. See `SearchProvider`.
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<Genre | "all">("all");
  const [sort, setSort] = useState<Sort>("popular");

  // Typing stays responsive while the grid re-filters against the full
  // catalogue: React renders the input from the live value and the cards from
  // the lagging one, instead of blocking the keystroke on 318 comparisons.
  const deferred = useDeferredValue(query);
  const needle = deferred.trim();
  const searching = needle.length > 0;

  // Which categories the catalogue actually has, best-ranked first. Read off
  // the array rather than off `GENRES`, because the catalogue is rank-ascending
  // and so first appearance is the same order the shelves used to be in — the
  // genre whose best activity ranks highest leads the menu.
  const genres = useMemo(() => {
    const order: Genre[] = [];
    for (const activity of catalogue) {
      if (!order.includes(activity.genre)) order.push(activity.genre);
    }
    return order;
  }, [catalogue]);

  const shown = useMemo(() => {
    const inGenre =
      genre === "all"
        ? catalogue
        : catalogue.filter((activity) => activity.genre === genre);

    const matched = searching ? filterActivities(inGenre, needle) : inGenre;

    // The catalogue is already rank-ascending, so "popular" is the array as it
    // stands and only the alphabetical order costs a sort.
    return sort === "title"
      ? [...matched].sort((a, b) => a.title.localeCompare(b.title))
      : matched;
  }, [catalogue, genre, needle, searching, sort]);

  const filtered = searching || genre !== "all";

  return (
    <div className="flex flex-col gap-6">
      <div
        className={cn(
          "sticky top-0 z-20 flex items-center gap-3 py-3",
          "-mx-6 px-6 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10",
          "bg-surface/85 backdrop-blur-md",
        )}
      >
        <search className="min-w-0 flex-1">
          {/* The field's own tint rather than the group's white, so it sits in
              the bar the way the funnel and the sort control beside it do,
              and only turns to paper once you are typing in it. */}
          <InputGroup
            size="lg"
            className="bg-foreground/[0.03] px-3 transition-colors focus-within:bg-background"
          >
            <InputAddon className="text-muted-foreground">
              <MagnifyingGlassIcon />
            </InputAddon>
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${catalogue.length} activities by name`}
              aria-label="Search activities"
              className="text-[0.9375rem] placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
            />
            {searching && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              >
                <XMarkIcon className="size-4" />
              </button>
            )}
          </InputGroup>
        </search>

        <CategoryMenu
          genres={genres}
          genre={genre}
          onChange={setGenre}
          catalogue={catalogue}
        />

        <SegmentedControl
          aria-label="Sort activities"
          value={sort}
          onValueChange={setSort}
          options={SORTS}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState>
          Nothing matches “{needle}”
          {genre !== "all" ? ` in ${GENRES[genre].label}` : ""}.
        </EmptyState>
      ) : (
        /* Only once something has been narrowed. Unfiltered, the count is the
           number already sitting in the placeholder of the field above it, and
           the grid itself is the answer. */
        filtered && (
          <p className="-mb-2 text-xs text-faint">
            {shown.length} of {catalogue.length}
            {searching ? ` match “${needle}”` : ""}
            {genre !== "all" ? ` in ${GENRES[genre].label}` : ""}
          </p>
        )
      )}

      <ActivityGrid shown={shown} />
    </div>
  );
}
