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
  categories = GENRES,
}: {
  genres: readonly string[];
  genre: string;
  onChange: (genre: string) => void;
  catalogue: readonly { genre: string }[];
  categories?: Record<string, { label: string; hue: string }>;
}) {
  const counts = useMemo(() => {
    const tally = new Map<string, number>();
    for (const activity of catalogue) {
      tally.set(activity.genre, (tally.get(activity.genre) ?? 0) + 1);
    }
    return tally;
  }, [catalogue]);

  const chosen = genre === "all" ? null : categories[genre];

  return (
    <Menu>
      <MenuTrigger
        aria-label={chosen ? `Category: ${chosen.label}` : "Filter by category"}
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg border text-[0.8125rem] transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring",
          chosen
            ? "border-foreground/40 font-medium text-foreground"
            : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
        )}
      >
        <FunnelIcon className="size-4 shrink-0" />
      </MenuTrigger>

      <MenuContent align="end" sideOffset={8} className="min-w-[13rem]">
        <MenuRadioGroup
          value={genre}
          onValueChange={(value) => onChange(value as string)}
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
                style={{ background: categories[value].hue }}
              />
              {categories[value].label}
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
