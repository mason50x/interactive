"use client";

import { useEffect, useRef, useState } from "react";
import { Flame } from "@/components/app/flame";
import { useStreak } from "@/components/streak-provider";
import { streakLabel } from "@/lib/streak";
import { cn } from "@/lib/utils";

/** Must outlast `streak-pop` in globals.css, and is cleared by the timer. */
const POP_MS = 800;

/**
 * The pill under the name in the rail.
 *
 * It used to say `BETA`, which was true of the product and said nothing about
 * the account looking at it. This is the other thing that fits in a line under
 * a name: how many days in a row you have turned up. When there is a
 * subscription to read, it goes beside this rather than instead of it.
 *
 * A flame and a count, and nothing else. The chip sits on the page's own card
 * ground — white over the light rail, a step up out of the dark one — and is
 * lifted off it by a shadow rather than tinted into it, so the fire is the
 * only colour in the shape and the word after the number is the only word.
 *
 * The number is the account's, so it comes from the account's subscription and
 * not from a prop — `UserMenu` should not have to thread a streak through
 * itself to reach the one span that draws it.
 */
export function StreakBadge() {
  const streak = useStreak();
  const current = streak?.current ?? 0;

  // A pop on the frame the number changes, which is the small acknowledgement
  // the chip owes a claim that happened while the rail was already on screen —
  // a day rolling over in a tab left open overnight, or another tab claiming
  // it. The big celebration is elsewhere and only fires on the claim itself;
  // this one fires on any change, including the arrival of the first value,
  // which is deliberate: a chip that appears out of nothing should move.
  const [popping, setPopping] = useState(false);
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (streak === null) return;
    if (previous.current === current) return;

    const first = previous.current === null;
    previous.current = current;
    if (first && current === 0) return;

    setPopping(true);
    const timer = setTimeout(() => setPopping(false), POP_MS);
    return () => clearTimeout(timer);
  }, [streak, current]);

  // Holds the chip's exact height while the subscription resolves, so the name
  // above it does not shift when the number lands. The row itself is a fixed
  // `h-14`, so this is about the two lines inside it, not the rail.
  if (streak === null) {
    return <span aria-hidden className="mt-1 block h-[1.1875rem]" />;
  }

  const lit = current > 0;

  return (
    <span
      className={cn(
        // Raised, not tinted: a card-coloured chip with a hairline and a soft
        // drop under it. The hairline flips with the theme because a shadow
        // alone is invisible on the dark rail, which is nearly the same value
        // as the shadow itself.
        "mt-1 inline-flex max-w-full items-center gap-1 rounded-full bg-card py-[0.125rem] pr-2 pl-1.5 text-[0.6875rem] font-medium text-fire-ink shadow-sm shadow-black/[0.08] ring-1 ring-black/[0.06] ring-inset dark:ring-white/[0.07]",
        !lit && "text-muted-foreground",
        // The transform has to be its own element's, and this span is the one
        // that has a shape worth scaling.
        popping && "animate-streak-pop",
      )}
    >
      <Flame className="size-3.5 shrink-0" lit={lit} />
      <span className="truncate tabular-nums">{streakLabel(current)}</span>
    </span>
  );
}
