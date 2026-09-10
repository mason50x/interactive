"use client";

import { Menu } from "@base-ui/react/menu";
import {
  CheckIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { useDeferredValue, useMemo, useState } from "react";
import { ActivityCard } from "@/components/app/activity-card";
import { type Activity, filterActivities, type Genre } from "@/lib/activity";
import { GENRES } from "@/lib/genres";
import { useFlip } from "@/lib/use-flip";
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
 */

type Sort = "popular" | "title";

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

  // Every one of the three controls above ends in the same place — a different
  // set of cards in a different order — so the grid animates the difference
  // rather than each control animating itself. See `useFlip`.
  const { frame, ghosts } = useFlip(shown);

  return (
    <div className="flex flex-col gap-6">
      <div
        className={cn(
          "sticky top-0 z-20 flex items-center gap-3 py-3",
          "-mx-6 px-6 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10",
          "bg-surface/85 backdrop-blur-md",
        )}
      >
        <search className="relative min-w-0 flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${catalogue.length} activities by name`}
            aria-label="Search activities"
            className={cn(
              "h-10 w-full rounded-lg border border-border bg-foreground/[0.03] pr-9 pl-9 text-[0.9375rem] text-foreground transition-colors outline-none",
              "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring",
              "[&::-webkit-search-cancel-button]:appearance-none",
            )}
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            >
              <XMarkIcon className="size-4" />
            </button>
          )}
        </search>

        <CategoryMenu
          genres={genres}
          genre={genre}
          onChange={setGenre}
          catalogue={catalogue}
        />

        <SortToggle sort={sort} onChange={setSort} />
      </div>

      {shown.length === 0 ? (
        <p className="text-[0.9375rem] text-muted-foreground">
          Nothing matches “{needle}”
          {genre !== "all" ? ` in ${GENRES[genre].label}` : ""}.
        </p>
      ) : (
        /* Only once something has been narrowed. Unfiltered, the count is the
           number already sitting in the placeholder of the field above it, and
           the grid itself is the answer. */
        filtered && (
          <p className="text-xs -mb-2 text-faint">
            {shown.length} of {catalogue.length}
            {searching ? ` match “${needle}”` : ""}
            {genre !== "all" ? ` in ${GENRES[genre].label}` : ""}
          </p>
        )
      )}

      {/* The grid is rendered at every count, including none, because it is
          also where cards leave from: `useFlip` fades a departing card out
          over the space it used to occupy, and the last card to go is the one
          the empty state would otherwise have unmounted the whole layer out
          from under. */}
      <div ref={frame} className="relative">
        {/* Three across and no further. The tile is the art, and a fourth
            column buys another card at the price of shrinking every one of
            them past the point where the thumbnail reads. */}
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((activity) => (
            <li key={activity.slug} data-flip={activity.slug}>
              <ActivityCard activity={activity} />
            </li>
          ))}
        </ul>

        {/* Where cards that no longer match are held for the fifth of a second
            it takes them to fade. Out of the layout, out of the tab order and
            out of the accessibility tree — by the time anything is in here it
            is a picture of something that has already gone. */}
        <div
          ref={ghosts}
          inert
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
        />
      </div>
    </div>
  );
}

/**
 * The categories, behind the funnel beside the search field.
 *
 * They were a row of seven chips under the bar, which cost a whole line of the
 * page at every width to say something you set once and then read past — and
 * on a phone that line was itself a sideways scroller, so most of the
 * categories were hidden anyway. A menu spends nothing until you open it, and
 * what it costs when closed is one button's worth of bar.
 *
 * The trigger still carries the answer: with a category chosen it says which
 * one, in that category's own colour, so the filter is legible without being
 * opened. That is the part of the chips worth keeping.
 *
 * Radio items rather than plain ones, because these are one choice out of
 * seven and the menu should say so to a screen reader as well as with the
 * check. `closeOnClick` is on for the same reason: picking a category is the
 * whole errand, and Base UI leaves a radio item open by default for menus that
 * take several answers.
 */
function CategoryMenu({
  genres,
  genre,
  onChange,
  catalogue,
}: {
  genres: readonly Genre[];
  genre: Genre | "all";
  onChange: (genre: Genre | "all") => void;
  catalogue: readonly Activity[];
}) {
  const counts = useMemo(() => {
    const tally = new Map<Genre, number>();
    for (const activity of catalogue) {
      tally.set(activity.genre, (tally.get(activity.genre) ?? 0) + 1);
    }
    return tally;
  }, [catalogue]);

  const chosen = genre === "all" ? null : GENRES[genre];

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={chosen ? `Category: ${chosen.label}` : "Filter by category"}
        className={cn(
          "flex h-10 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-[0.8125rem] transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring",
          chosen
            ? "border-border bg-foreground/[0.08] font-medium text-foreground"
            : "border-border bg-foreground/[0.03] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
        )}
      >
        <FunnelIcon className="size-4 shrink-0" />
        {chosen && (
          <>
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: chosen.hue }}
            />
            {/* The label is the one part that goes when there is no room for
                it. The dot and the filled trigger still say a filter is on. */}
            <span className="hidden sm:inline">{chosen.label}</span>
          </>
        )}
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-50 outline-none"
        >
          <Menu.Popup className={popupClass}>
            <Menu.RadioGroup
              value={genre}
              onValueChange={(value) => onChange(value as Genre | "all")}
            >
              <Menu.RadioItem value="all" closeOnClick className={itemClass}>
                <Indicator />
                <span className="size-1.5 shrink-0 rounded-full bg-faint" />
                Everything
                <span className="ml-auto pl-4 text-faint">
                  {catalogue.length}
                </span>
              </Menu.RadioItem>

              {genres.map((value) => (
                <Menu.RadioItem
                  key={value}
                  value={value}
                  closeOnClick
                  className={itemClass}
                >
                  <Indicator />
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: GENRES[value].hue }}
                  />
                  {GENRES[value].label}
                  <span className="ml-auto pl-4 text-faint">
                    {counts.get(value)}
                  </span>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The check, in a column the unchecked rows also occupy — so choosing one
 *  does not shunt every label sideways by the width of a tick. */
function Indicator() {
  return (
    <Menu.RadioItemIndicator
      keepMounted
      className="flex size-3.5 shrink-0 items-center justify-center text-foreground data-unchecked:invisible"
    >
      <CheckIcon className="size-3.5" />
    </Menu.RadioItemIndicator>
  );
}

const popupClass =
  // The open/close motion is `.popup-slide` in globals.css rather than
  // utilities here — that rule explains why Tailwind cannot express it.
  "popup-slide min-w-[13rem] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg shadow-black/[0.08] outline-none";

const itemClass =
  "flex h-9 cursor-default items-center gap-2 rounded-lg px-2.5 text-[0.875rem] text-muted-foreground outline-none select-none data-highlighted:bg-foreground/[0.05] data-highlighted:text-foreground data-checked:text-foreground";

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
      className="flex h-10 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-foreground/[0.03] p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={sort === option.value}
          className={cn(
            "h-full rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors",
            sort === option.value
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
