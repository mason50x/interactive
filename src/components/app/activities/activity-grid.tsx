"use client";

import { ActivityCard } from "@/components/app/activity-card";
import type { Activity } from "@/lib/activity";
import { useFlip } from "@/lib/use-flip";

/**
 * The grid the catalogue page is: every surviving card, three across, and
 * the layer departing cards fade out in.
 *
 * Every one of the browser's controls ends in the same place — a different
 * set of cards in a different order — so the grid animates the difference
 * rather than each control animating itself. See `useFlip`.
 */
export function ActivityGrid({ shown }: { shown: readonly Activity[] }) {
  const { frame, ghosts } = useFlip(shown);

  return (
    /* The grid is rendered at every count, including none, because it is
       also where cards leave from: `useFlip` fades a departing card out
       over the space it used to occupy, and the last card to go is the one
       the empty state would otherwise have unmounted the whole layer out
       from under. */
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
  );
}
