"use client";

import { useQuery } from "convex/react";
import { Card } from "@/components/ui/card";
import { splitDuration } from "@/lib/time";
import { useTzOffset } from "@/lib/use-tz-offset";
import { api } from "../../../../convex/_generated/api";

/**
 * Four numbers about your own use of the place.
 *
 * All of them come from one subscription, which is deliberate — four cards
 * each watching their own query would be four websocket subscriptions to draw
 * one row, and they would land at four different moments and make the row
 * flicker into place.
 *
 * Time is the first tile because it is the only one of the four that is about
 * effort rather than variety, and it is split into a value and a unit so the
 * number can be set large without "minutes" being set large with it. See
 * `splitDuration`.
 */
export function StatsCard() {
  const tzOffsetMinutes = useTzOffset();
  const summary = useQuery(api.views.summary, { tzOffsetMinutes });

  const today = splitDuration(summary?.todaySeconds ?? 0);
  const week = splitDuration(summary?.weekSeconds ?? 0);

  return (
    <Card className="flex flex-col justify-between gap-5 p-5">
      <p className="label-small text-faint">Your activity</p>

      {/* Two by two rather than a strip of four: at this card's width four
          columns give each number about six characters, and "activities" then
          has to be abbreviated into something nobody says. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <Stat value={today.value} unit={today.unit} label="Today" />
        <Stat value={week.value} unit={week.unit} label="This week" />
        <Stat
          value={`${summary?.activitiesTried ?? 0}`}
          unit={summary?.activitiesTried === 1 ? "activity" : "activities"}
          label="Tried"
        />
        <Stat
          value={`${summary?.totalViews ?? 0}`}
          unit={summary?.totalViews === 1 ? "view" : "views"}
          label="All time"
        />
      </div>
    </Card>
  );
}

/**
 * One number, its unit, and what it counts.
 *
 * The caption is under the number rather than over it. Reading order is
 * value-then-meaning, which is the order you want when the row is being
 * scanned rather than read — the eye lands on the digits either way, and the
 * caption is what it falls to next.
 */
function Stat({
  value,
  unit,
  label,
}: {
  value: string;
  unit: string;
  label: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-baseline gap-1">
        <span className="text-[1.5rem] leading-none font-semibold tabular-nums text-foreground">
          {value}
        </span>
        <span className="truncate text-[0.75rem] text-muted-foreground">
          {unit}
        </span>
      </p>
      <p className="label-small mt-1 text-faint">{label}</p>
    </div>
  );
}
