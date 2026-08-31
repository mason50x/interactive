"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityCard } from "@/components/app/activity-card";
import type { Activity } from "@/lib/activity";
import { cn } from "@/lib/utils";

/**
 * A row of activity tiles you scroll sideways, and the two arrows over it.
 *
 * Lifted out of the genre shelves the catalogue page used to be, which were
 * the only thing that had one until the home page wanted four. The shelves are
 * gone — `/dashboard/activities` is a grid now — and what is left here is the
 * part that was always about a row rather than about a genre. The home page's
 * rows are "most popular today" and "jump back in", which have heads of their
 * own and no genre at all.
 *
 * The row overflows its container on both sides on purpose. Cards running off
 * the right edge of the shell is the affordance — it is what says there is
 * more without a control having to say so — and the negative margin is what
 * lets them reach the edge while whatever sits above stays on the page's
 * measure.
 */
export function ActivityRow({
  activities,
  /**
   * The line a card reveals under its title on hover. Returning `undefined`
   * leaves the card's own default, which is its rank in the catalogue.
   *
   * A function rather than a map keyed by slug, because every caller is
   * deriving it from something it already holds — a view count, a timestamp —
   * and building an object first would only be the same loop written twice.
   */
  note,
}: {
  activities: readonly Activity[];
  note?: (activity: Activity) => string | undefined;
}) {
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
  }, [measure, activities]);

  function page(direction: -1 | 1) {
    const el = row.current;
    if (!el) return;
    // Not a full width. Leaving a sliver of the last card visible is what
    // makes the jump read as the row moving rather than as the row being
    // replaced.
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <div className="group/row relative">
      <ul
        ref={row}
        className={cn(
          "flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2",
          // Bleeds to the container's edge and back, so the padding the page
          // sets is spent inside the scroller instead of clipping it.
          "-mx-6 scroll-px-6 px-6 sm:-mx-10 sm:scroll-px-10 sm:px-10",
        )}
      >
        {activities.map((activity) => (
          <li
            key={activity.slug}
            className="w-[15rem] shrink-0 snap-start sm:w-[17rem]"
          >
            <ActivityCard activity={activity} note={note?.(activity)} />
          </li>
        ))}
      </ul>

      <RowArrow side="start" hidden={atStart} onClick={() => page(-1)} />
      <RowArrow side="end" hidden={atEnd} onClick={() => page(1)} />
    </div>
  );
}

/**
 * One of the two paging controls, floated over the end of the row.
 *
 * Hidden from assistive tech rather than merely styled away, because it does
 * nothing a keyboard user needs: tabbing through the cards scrolls the row to
 * whichever one takes focus, which is the same journey the arrow makes and
 * without the extra two stops per row.
 */
function RowArrow({
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
        // Quiet until you are working in this row. `pointer-events-none`
        // has to travel with the opacity or an invisible button still eats
        // clicks meant for the card beneath it.
        hidden
          ? "pointer-events-none opacity-0"
          : "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
