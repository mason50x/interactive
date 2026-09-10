"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Everyone, a day at a time.
 *
 * The global room is a sequence of local calendar days rather than one endless
 * scroll, and this is the calendar for it: a clock that only ticks at
 * midnight, the arithmetic that turns "three days ago" into the two instants
 * the server bounds a page by, and the pager that walks between them. The
 * thread owns which day is showing; this owns what a day is.
 */

/** Today plus the twenty-nine complete calendar pages behind it. Mirrors the
 *  global room's thirty-day retention window on the server. */
const GLOBAL_DAY_PAGES = 30;

/**
 * A clock that moves only when the calendar page changes. Using the app's
 * minute clock here would re-render every loaded message sixty times an hour
 * even though the day bounds and every label stay identical.
 */
export function useDayClock(): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const delay = Math.max(1_000, midnight.getTime() - Date.now() + 100);
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [now]);

  return now;
}

/**
 * The exact local-midnight bounds for one page of Everyone.
 *
 * Local Date arithmetic matters here: subtracting a flat 24 hours is wrong on
 * the two days a year that daylight saving time changes. The server receives
 * the resulting instants and uses them only to bound a conversation the caller
 * is already allowed to read.
 */
export function dayBounds(now: number, daysAgo: number) {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(0, 0, 0, 0);

  const next = new Date(date);
  next.setDate(next.getDate() + 1);

  return { date, start: date.getTime(), end: next.getTime() };
}

function compactDay(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function DayPager({
  now,
  daysAgo,
  onChange,
}: {
  now: number;
  daysAgo: number;
  onChange: (daysAgo: number) => void;
}) {
  const selected = dayBounds(now, daysAgo).date;
  const older = dayBounds(now, daysAgo + 1).date;
  const newer = daysAgo > 0 ? dayBounds(now, daysAgo - 1).date : null;
  const live = daysAgo === 0;

  if (live) {
    return (
      <nav aria-label="Everyone by day" className="flex justify-center pb-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          aria-label={`View ${compactDay(older)}`}
          onClick={() => onChange(1)}
        >
          <ChevronLeftIcon />
          Yesterday
        </Button>
      </nav>
    );
  }

  return (
    <nav aria-label="Everyone by day" className="flex justify-center pb-2">
      <div className="grid grid-cols-[2rem_minmax(9rem,auto)_2rem] items-center">
        {daysAgo < GLOBAL_DAY_PAGES - 1 ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={`View ${compactDay(older)}`}
            onClick={() => onChange(daysAgo + 1)}
          >
            <ChevronLeftIcon />
          </Button>
        ) : (
          <span />
        )}

        <p className="text-center text-[0.75rem] font-semibold text-muted-foreground">
          {selected.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>

        {newer !== null ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={
              daysAgo === 1
                ? "Return to today's messages"
                : `View ${compactDay(newer)}`
            }
            onClick={() => onChange(daysAgo - 1)}
          >
            <ChevronRightIcon />
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
