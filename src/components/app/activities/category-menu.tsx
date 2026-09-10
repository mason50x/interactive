"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon, FunnelIcon } from "@heroicons/react/24/solid";
import { useMemo } from "react";
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
import type { Activity, Genre } from "@/lib/activity";
import { GENRES } from "@/lib/genres";
import { cn } from "@/lib/utils";

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
export function CategoryMenu({
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
    <Menu>
      <MenuTrigger
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
      </MenuTrigger>

      <MenuContent align="end" sideOffset={8} className="min-w-[13rem]">
        <MenuRadioGroup
          value={genre}
          onValueChange={(value) => onChange(value as Genre | "all")}
        >
          <MenuRadioItem value="all" closeOnClick tone="muted" size="tall">
            <Indicator />
            <span className="size-1.5 shrink-0 rounded-full bg-faint" />
            Everything
            <span className="ml-auto pl-4 text-faint">{catalogue.length}</span>
          </MenuRadioItem>

          {genres.map((value) => (
            <MenuRadioItem
              key={value}
              value={value}
              closeOnClick
              tone="muted"
              size="tall"
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
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

/** The check, in a column the unchecked rows also occupy — so choosing one
 *  does not shunt every label sideways by the width of a tick. */
function Indicator() {
  return (
    <MenuPrimitive.RadioItemIndicator
      keepMounted
      className="flex size-3.5 shrink-0 items-center justify-center text-foreground data-unchecked:invisible"
    >
      <CheckIcon className="size-3.5" />
    </MenuPrimitive.RadioItemIndicator>
  );
}
