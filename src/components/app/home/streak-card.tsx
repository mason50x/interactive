"use client";

import { CheckIcon } from "@heroicons/react/24/solid";
import { useQuery } from "convex/react";
import { Flame } from "@/components/app/flame";
import { useStreak } from "@/components/streak-provider";
import { Card } from "@/components/ui/card";
import { useTzOffset } from "@/lib/use-tz-offset";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";

/**
 * The streak, as a run rather than as a number.
 *
 * The number is already in the chip in the rail, so a card that only enlarged
 * it would be the least useful thing on the page. What is not anywhere else is
 * the *shape* of the run, and that is what this card draws.
 *
 * The chain is the week behind you: seven nodes with the links between them
 * lit only where both ends are. That is what turns a row of dots into a run —
 * a missed Wednesday does not merely leave a gap, it visibly breaks the chain
 * on both sides, which is the thing a streak is actually about.
 *
 * Today is always the last node, so the chain reads left to right into the
 * present rather than being a calendar week that resets on Sunday.
 */

/** Seven placeholders, so the card is its final height on the first frame and
 *  the cards beside it do not jump when the query lands. */
const PENDING = Array.from({ length: 7 }, () => null);

export function StreakCard() {
  const streak = useStreak();
  const tzOffsetMinutes = useTzOffset();
  const week = useQuery(api.streaks.week, { tzOffsetMinutes });

  const current = streak?.current ?? 0;
  const lit = current > 0;

  const days = week ?? PENDING;

  return (
    <Card className="relative isolate flex flex-col justify-between gap-6 overflow-hidden p-5">
      {/* The heat. A radial wash in the corner the flame sits in, at a
          strength that follows the streak — off entirely when there isn't
          one, so a lapsed card is cool rather than glowing about nothing. */}
      {lit && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 -z-10 size-48 rounded-full opacity-[0.18]"
          style={{
            background:
              "radial-gradient(circle, var(--fire) 0%, transparent 68%)",
          }}
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-small text-faint">Streak</p>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span
              className={cn(
                "text-[2.75rem] leading-none font-semibold tabular-nums",
                lit ? "text-fire-ink" : "text-muted-foreground",
              )}
            >
              {current}
            </span>
            <span className="text-[0.875rem] text-muted-foreground">
              {current === 1 ? "day" : "days"}
            </span>
          </p>
        </div>

        <Flame className="size-11 shrink-0" lit={lit} />
      </div>

      <div>
        <Chain days={days} />

        {/* The screen-reader version of the chain, which is decoration for a
            fact this states outright. */}
        <p className="sr-only">
          {week
            ? `${week.filter((day) => day.visited).length} of the last 7 days.`
            : "Loading this week."}
        </p>
      </div>
    </Card>
  );
}

/**
 * Seven days as a chain: a node per day, a link between each pair.
 *
 * The link is lit only when the days on both sides of it are, which is what
 * makes an unbroken week read as one continuous object and a broken one read
 * as two pieces. Drawn as flex children rather than as an SVG because the
 * whole thing is rectangles on a row, and a row of divs stretches to the
 * card's width without anything having to know what that width is.
 *
 * A claimed day carries a tick rather than being a filled dot. A dot only
 * says *different from the others*, which leaves the reader to work out which
 * of the two colours is the good one; a tick says done, and it says it without
 * relying on the colour at all. That costs the node some size — a tick under
 * about 20px is a smudge — so the whole row is drawn at the size the tick
 * needs and the unclaimed days are hollow rings at the same diameter.
 */
function Chain({
  days,
}: {
  days: readonly ({ day: string; visited: boolean; seconds: number } | null)[];
}) {
  return (
    <div aria-hidden>
      <div className="flex items-center">
        {days.map((day, index) => {
          const previous = index > 0 ? days[index - 1] : null;
          const linked = Boolean(day?.visited && previous?.visited);
          const today = index === days.length - 1;

          return (
            <div
              key={day?.day ?? index}
              className={cn("flex items-center", index > 0 && "flex-1")}
            >
              {index > 0 && (
                <div
                  className={cn(
                    "h-[3px] w-full transition-colors duration-500",
                    linked ? "bg-fire" : "bg-surface-muted",
                  )}
                />
              )}

              <div
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-500",
                  day?.visited
                    ? "bg-fire text-white"
                    : "border border-border-strong bg-surface-muted",
                  // Today gets a halo whether or not it is claimed, so an
                  // unclaimed today still reads as *today* rather than as one
                  // more day that did not happen.
                  today && "ring-[3px] ring-fire/25",
                )}
              >
                {day?.visited && <CheckIcon className="size-3.5" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* The same flex skeleton as the row above — a fixed-width cell per day
          with a flexing gap between — rather than `justify-between` over seven
          spans. `justify-between` distributes by the letters' own widths, which
          lands each one a few pixels off the node it belongs to; mirroring the
          structure puts them under the nodes exactly. */}
      <div className="mt-2 flex items-center">
        {days.map((day, index) => (
          <div
            key={day?.day ?? index}
            className={cn("flex items-center", index > 0 && "flex-1")}
          >
            {index > 0 && <div className="w-full" />}

            <span
              className={cn(
                "w-5 shrink-0 text-center text-[0.625rem]",
                day?.visited ? "text-muted-foreground" : "text-faint",
              )}
            >
              {day
                ? new Date(`${day.day}T00:00:00`).toLocaleDateString(
                    undefined,
                    { weekday: "narrow" },
                  )
                : " "}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
