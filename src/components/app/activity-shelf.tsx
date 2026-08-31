"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityCard } from "@/components/app/activity-card";
import type { Game, Genre } from "@/lib/games";
import { GENRES } from "@/lib/genres";
import { cn } from "@/lib/utils";

/**
 * One genre, as a head and a row you scroll sideways.
 *
 * A row rather than a grid because the catalogue is not a flat set of 318
 * things — it is six sections of wildly different sizes, and arcade alone is
 * 130 games. A grid of all of them is a wall you scroll past; six rows are six
 * decisions, each one shelf-height, and the head tells you what you are
 * looking at before you look at it.
 *
 * The row overflows its container on both sides on purpose. Cards running off
 * the right edge of the shell is the affordance — it is what says there is
 * more without a control having to say so — and the negative margin is what
 * lets them reach the edge while the head above stays on the page's measure.
 */
export function ActivityShelf({
  genre,
  games,
  /** Shown instead of the genre's own copy when the row is a filtered subset. */
  countLabel,
}: {
  genre: Genre;
  games: readonly Game[];
  countLabel?: string;
}) {
  const meta = GENRES[genre];
  const row = useRef<HTMLUListElement>(null);

  // Which arrows are worth showing. Both start false so nothing flashes in
  // before the first measurement — a row shorter than the viewport never
  // shows either.
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    // A pixel of slack: fractional scroll positions mean `scrollLeft +
    // clientWidth` lands a hair short of `scrollWidth` at the true end, and
    // without it the right arrow never switches off.
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = row.current;
    if (!el) return;

    // Back to the head whenever the cards change under the row. Without this
    // a re-sort leaves the row wherever it was — switch to A-Z with the
    // platformers scrolled a third of the way in and the shelf opens somewhere
    // in the S's. `instant` because `scroll-smooth` would otherwise animate
    // the whole width of an 82-card row.
    el.scrollTo({ left: 0, behavior: "instant" });
    measure();
    el.addEventListener("scroll", measure, { passive: true });

    // The row's overflow changes without it scrolling: the window resizes, the
    // rail collapses at `lg`, or a filter swaps the cards underneath it. One
    // observer on the element catches all three.
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, games]);

  function page(direction: -1 | 1) {
    const el = row.current;
    if (!el) return;
    // Not a full width. Leaving a sliver of the last card visible is what
    // makes the jump read as the row moving rather than as the row being
    // replaced.
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <section
      className="group/shelf"
      style={{ "--hue": meta.hue } as React.CSSProperties}
      aria-labelledby={`shelf-${genre}`}
    >
      <div className="flex items-center gap-3">
        {/* The mark itself, at the height of the two lines beside it and in
            the genre's own colour. No plate under it: a tinted square would
            add a second shape to read before the icon inside it, and at this
            size the solid cut carries the shelf on its own. */}
        <meta.icon
          className="size-10 shrink-0"
          style={{ color: "var(--hue)" }}
        />

        <div className="min-w-0">
          <h2
            id={`shelf-${genre}`}
            className="text-[1.25rem] leading-tight font-semibold text-foreground"
          >
            {meta.label}
          </h2>
          <p className="label-small mt-0.5 truncate text-faint">
            {countLabel ?? `${meta.description} ${games.length} of them.`}
          </p>
        </div>
      </div>

      <div className="relative mt-4">
        <ul
          ref={row}
          className={cn(
            "flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2",
            // Bleeds to the container's edge and back, so the padding the page
            // sets is spent inside the scroller instead of clipping it.
            "-mx-6 scroll-px-6 px-6 sm:-mx-10 sm:scroll-px-10 sm:px-10",
            "no-scrollbar",
          )}
        >
          {games.map((game) => (
            <li
              key={game.slug}
              className="w-[15rem] shrink-0 snap-start sm:w-[17rem]"
            >
              <ActivityCard game={game} />
            </li>
          ))}
        </ul>

        <ShelfArrow side="start" hidden={atStart} onClick={() => page(-1)} />
        <ShelfArrow side="end" hidden={atEnd} onClick={() => page(1)} />
      </div>
    </section>
  );
}

/**
 * One of the two paging controls, floated over the end of the row.
 *
 * Hidden from assistive tech rather than merely styled away, because it does
 * nothing a keyboard user needs: tabbing through the cards scrolls the row to
 * whichever one takes focus, which is the same journey the arrow makes and
 * without the extra two stops per shelf.
 */
function ShelfArrow({
  side,
  hidden,
  onClick,
}: {
  side: "start" | "end";
  hidden: boolean;
  onClick: () => void;
}) {
  const Icon = side === "start" ? ChevronLeftIcon : ChevronRightIcon;

  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center sm:flex",
        "rounded-full border border-border bg-surface/85 text-foreground shadow-md backdrop-blur",
        "transition-[opacity,background-color] duration-200 hover:bg-surface",
        // Pulled half off the row's edge so it sits on the seam between the
        // last card and the page, not on top of the art.
        side === "start" ? "-left-4" : "-right-4",
        // Quiet until you are working in this shelf. `pointer-events-none`
        // has to travel with the opacity or an invisible button still eats
        // clicks meant for the card beneath it.
        hidden
          ? "pointer-events-none opacity-0"
          : "opacity-0 group-hover/shelf:opacity-100 group-focus-within/shelf:opacity-100",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
