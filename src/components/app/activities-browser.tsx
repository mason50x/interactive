"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { useDeferredValue, useMemo, useState } from "react";
import { ActivityShelf } from "@/components/app/activity-shelf";
import { useSearch } from "@/components/app/search-provider";
import type { Genre } from "@/lib/games";
import { GAMES, SHELVES, searchGames } from "@/lib/games";
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
 * All 318 entries are in the client bundle. That sounds worse than it is — the
 * catalogue is six short fields per game, about 10 KB gzipped, and shipping it
 * means search is instant and offline: no route handler, no request per
 * keystroke, no loading state to design.
 *
 * The 318 thumbnails are *not* eagerly loaded. Every `<img>` is lazy, and a
 * card sitting off the right-hand end of its row counts as off-screen, so an
 * untouched page pays for the two or three tiles visible in each shelf.
 */

type Sort = "popular" | "title";

export function ActivitiesBrowser() {
  const { query, setQuery } = useSearch();

  const [genre, setGenre] = useState<Genre | "all">("all");
  const [sort, setSort] = useState<Sort>("popular");

  // Typing stays responsive while the shelves re-filter against the full
  // catalogue: React renders the input from the live value and the rows from
  // the lagging one, instead of blocking the keystroke on 318 comparisons.
  const deferred = useDeferredValue(query);
  const needle = deferred.trim();
  const searching = needle.length > 0;

  // A set rather than a list, because the result has to be intersected with
  // each shelf and `searchGames` already walks the catalogue once.
  const matches = useMemo(
    () => (searching ? new Set(searchGames(needle).map((g) => g.slug)) : null),
    [needle, searching],
  );

  const shelves = useMemo(
    () =>
      SHELVES.filter((shelf) => genre === "all" || shelf.genre === genre)
        .map((shelf) => {
          const games = matches
            ? shelf.games.filter((game) => matches.has(game.slug))
            : shelf.games;

          return {
            genre: shelf.genre,
            // `SHELVES` is already rank-ascending, so "popular" is the array
            // as it stands and only the alphabetical order costs a sort.
            games:
              sort === "title"
                ? [...games].sort((a, b) => a.title.localeCompare(b.title))
                : games,
          };
        })
        .filter((shelf) => shelf.games.length > 0),
    [genre, matches, sort],
  );

  const total = shelves.reduce((sum, shelf) => sum + shelf.games.length, 0);

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
              placeholder={`Search ${GAMES.length} activities by name`}
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
        <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6 sm:-mx-10 sm:px-10">
          <FilterChip
            label="Everything"
            selected={genre === "all"}
            onClick={() => setGenre("all")}
          />
          {SHELVES.map((shelf) => (
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
              {total} of {GAMES.length} match “{needle}”
            </p>
          )}

          <div className="flex flex-col gap-12">
            {shelves.map((shelf) => (
              <ActivityShelf
                key={shelf.genre}
                genre={shelf.genre}
                games={shelf.games}
                countLabel={
                  searching
                    ? `${shelf.games.length} ${shelf.games.length === 1 ? "match" : "matches"}`
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
