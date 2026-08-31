"use client";

import { useQuery } from "convex/react";
import { Flame } from "@/components/app/flame";
import { useStreak } from "@/components/streak-provider";
import { Card } from "@/components/ui/card";
import { nextMilestone } from "@/lib/streak";
import { useTzOffset } from "@/lib/use-tz-offset";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";

/**
 * The streak, as a run rather than as a number.
 *
 * The number is already in two places — the chip in the rail and the line
 * under the greeting — so a card that only enlarged it would be the least
 * useful thing on the page. What is not anywhere else is the *shape* of the
 * run, and this card is two views of it.
 *
 * The chain is the week behind you: seven nodes with the links between them
 * lit only where both ends are. That is what turns a row of dots into a run —
 * a missed Wednesday does not merely leave a gap, it visibly breaks the chain
 * on both sides, which is the thing a streak is actually about.
 *
 * The bar under it is the run ahead: how far into the next milestone you are,
 * measured from the last one cleared. See `nextMilestone` for why it is
 * measured that way.
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
  const best = streak?.best ?? 0;
  const lit = current > 0;

  const days = week ?? PENDING;
  const milestone = nextMilestone(current);
  const toGo = milestone ? milestone.at - current : 0;

  // Clamped because a `best` set before this card existed can sit above the
  // milestone table's own idea of where you are, and a bar past 100% renders
  // as a fill that has escaped its track.
  const progress = milestone
    ? Math.min(
        1,
        Math.max(
          0,
          (current - milestone.from) / (milestone.at - milestone.from),
        ),
      )
    : 1;

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
          <p className="label-small mt-1.5 text-faint">
            {lit ? "in a row" : "not started"}
            {best > 0 && <> · best {best}</>}
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

        <div className="mt-4">
          <div
            aria-hidden
            className="h-1 overflow-hidden rounded-full bg-surface-muted"
          >
            <div
              className="h-full rounded-full bg-fire transition-[width] duration-700 ease-out"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="mt-2 text-[0.8125rem] text-muted-foreground">
            {milestone === null ? (
              "A year unbroken. There is nothing left to count towards."
            ) : lit ? (
              <>
                <span className="text-foreground tabular-nums">{toGo}</span>{" "}
                {toGo === 1 ? "day" : "days"} to {milestone.name}
              </>
            ) : (
              "Open something today and the run starts."
            )}
          </p>
        </div>
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
                  "size-3.5 shrink-0 rounded-full transition-colors duration-500",
                  day?.visited ? "bg-fire" : "bg-surface-muted",
                  // Today gets a halo whether or not it is claimed, so an
                  // unclaimed today still reads as *today* rather than as one
                  // more day that did not happen.
                  today && "ring-[3px] ring-fire/25",
                )}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between">
        {days.map((day, index) => (
          <span
            key={day?.day ?? index}
            className={cn(
              "text-[0.625rem]",
              day?.visited ? "text-muted-foreground" : "text-faint",
            )}
          >
            {day
              ? new Date(`${day.day}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: "narrow",
                })
              : " "}
          </span>
        ))}
      </div>
    </div>
  );
}
