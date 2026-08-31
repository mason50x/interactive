"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { useDeferredValue, useMemo, useState } from "react";
import { ActivityShelf } from "@/components/app/activity-shelf";
import { useSearch } from "@/components/app/search-provider";
import { filterActivities, type Genre, type Shelf } from "@/lib/activity";
import { GENRES } from "@/lib/genres";
import { cn } from "@/lib/utils";

/**
 * The catalogue, as the dashboard browses it: a filter bar over a stack of
 * genre shelves.
 *
 * Filtering never changes the shape of the page. A query and a genre chip both
 * do the same thing — narrow which cards survive into which rows — and a row
 * with nothing left in it drops out. There is no separate results view to
 * design, no layout that appears only when you type, and the thing you were
 * looking at stays where it was on screen while the set shrinks under it.
 *
 * The shelves arrive as a prop rather than as an import, and that is a
 * boundary, not a style choice. Importing the catalogue here would put all 318
 * entries into a `/_next/static` chunk, which is served with no session in
 * front of it — the route would be gated and the data would not. As a prop it
 * travels in this page's RSC payload instead, behind the same `auth.protect()`
 * as everything else on it. See `src/lib/activities.ts`.
 *
 * What does not change is the filtering: the whole catalogue is still in the
 * browser once the page has loaded — six short fields per activity, about
 * 10 KB gzipped — so search stays instant and local. No route handler, no
 * request per keystroke, no loading state to design.
 *
 * The 318 thumbnails are *not* eagerly loaded. Every `<img>` is lazy, and a
 * card sitting off the right-hand end of its row counts as off-screen, so an
 * untouched page pays for the two or three tiles visible in each shelf.
 */

type Sort = "popular" | "title";

export function ActivitiesBrowser({
  shelves: catalogue,
}: {
  shelves: readonly Shelf[];
}) {
  const { query, setQuery } = useSearch();

  // The shelves partition the catalogue, so this is its size. Counted here
  // rather than passed alongside, so there is no second number to keep in step.
  const total = useMemo(
    () => catalogue.reduce((sum, shelf) => sum + shelf.activities.length, 0),
    [catalogue],
  );

  const [genre, setGenre] = useState<Genre | "all">("all");
  const [sort, setSort] = useState<Sort>("popular");

  // Typing stays responsive while the shelves re-filter against the full
  // catalogue: React renders the input from the live value and the rows from
  // the lagging one, instead of blocking the keystroke on 318 comparisons.
  const deferred = useDeferredValue(query);
  const needle = deferred.trim();
  const searching = needle.length > 0;

  const shelves = useMemo(
    () =>
      catalogue
        .filter((shelf) => genre === "all" || shelf.genre === genre)
        .map((shelf) => {
          // Per shelf rather than once over the whole catalogue and then
          // intersected: the shelves partition it, so the two are the same set
          // and this way is one pass instead of a pass plus a lookup per card.
          const activities = searching
            ? filterActivities(shelf.activities, needle)
            : shelf.activities;

          return {
            genre: shelf.genre,
            // `SHELVES` is already rank-ascending, so "popular" is the array
            // as it stands and only the alphabetical order costs a sort.
            activities:
              sort === "title"
                ? [...activities].sort((a, b) => a.title.localeCompare(b.title))
                : activities,
          };
        })
        .filter((shelf) => shelf.activities.length > 0),
    [catalogue, genre, needle, searching, sort],
  );

  const shown = shelves.reduce((sum, shelf) => sum + shelf.activities.length, 0);

  return (
    <div className="flex flex-col gap-10">
      <div
        className={cn(
          "sticky top-0 z-20 flex flex-col gap-3 py-4",
          // Bleeds the frosted background out to the shell's edge so rows
          // passing underneath are covered rather than showing in the gutter.
          "-mx-6 px-6 sm:-mx-10 sm:px-10",
          "border-b border-border bg-surface/80 backdrop-blur-md",
        )}
      >
        <div className="flex items-center gap-3">
          <search className="relative min-w-0 flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${total} activities by name`}
              aria-label="Search activities"
              className={cn(
                "h-10 w-full rounded-lg border border-border bg-surface pr-9 pl-9 text-[0.9375rem] text-foreground transition-[border-color,box-shadow] outline-none",
                "placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                // Chrome draws its own clear button inside a `type="search"`
                // field, which would sit beside ours. Ours stays because it is
                // the one that matches the rest of the app and the one that
                // exists in every browser.
                "[&::-webkit-search-cancel-button]:appearance-none",
              )}
            />
            {searching && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-faint transition-colors hover:text-foreground"
              >
                <XMarkIcon className="size-4" />
              </button>
            )}
          </search>

          <SortToggle sort={sort} onChange={setSort} />
        </div>

        {/* Horizontal scroll rather than wrap, so the bar is one line tall at
            every width and the shelves below never shift down a row when the
            window narrows. */}
        <div className="-mx-6 flex gap-2 overflow-x-auto px-6 sm:-mx-10 sm:px-10">
          <FilterChip
            label="Everything"
            selected={genre === "all"}
            onClick={() => setGenre("all")}
          />
          {catalogue.map((shelf) => (
            <FilterChip
              key={shelf.genre}
              label={GENRES[shelf.genre].label}
              hue={GENRES[shelf.genre].hue}
              selected={genre === shelf.genre}
              onClick={() => setGenre(shelf.genre)}
            />
          ))}
        </div>
      </div>

      {shelves.length === 0 ? (
        <p className="text-[0.9375rem] text-muted-foreground">
          Nothing matches “{needle}”
          {genre !== "all" ? ` in ${GENRES[genre].label}` : ""}.
        </p>
      ) : (
        <>
          {searching && (
            <p className="label-small -mb-4 text-faint">
              {shown} of {total} match “{needle}”
            </p>
          )}

          <div className="flex flex-col gap-12">
            {shelves.map((shelf) => (
              <ActivityShelf
                key={shelf.genre}
                genre={shelf.genre}
                activities={shelf.activities}
                countLabel={
                  searching
                    ? `${shelf.activities.length} ${shelf.activities.length === 1 ? "match" : "matches"}`
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A genre filter, carrying its shelf's colour.
 *
 * Selected borrows `.nav-pill` from the rail rather than inventing a second
 * selected treatment: one raised blue face means "this is the thing you are
 * on" everywhere in the app. The genre's own hue stays on the unselected chip,
 * as a dot, which is what ties the chip to the shelf it scrolls you to.
 */
function FilterChip({
  label,
  hue,
  selected,
  onClick,
}: {
  label: string;
  hue?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] transition-colors",
        selected
          ? "nav-pill text-primary-foreground"
          : "border-border bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground",
      )}
    >
      {hue && (
        <span
          className="size-1.5 rounded-full"
          style={{ background: selected ? "currentColor" : hue }}
        />
      )}
      {label}
    </button>
  );
}

/** Popular or alphabetical, as a two-stop segmented control. */
function SortToggle({
  sort,
  onChange,
}: {
  sort: Sort;
  onChange: (sort: Sort) => void;
}) {
  const options: { value: Sort; label: string }[] = [
    { value: "popular", label: "Popular" },
    { value: "title", label: "A–Z" },
  ];

  return (
    <div
      role="group"
      aria-label="Sort activities"
      className="flex h-10 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={sort === option.value}
          className={cn(
            "h-full rounded-md px-2.5 text-[0.8125rem] transition-colors",
            sort === option.value
              ? "bg-surface-muted text-foreground"
              : "text-faint hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
