"use client";

import { Flame } from "@/components/app/flame";
import { useStreak } from "@/components/streak-provider";
import { streakLabel, streakMessage } from "@/lib/streak";

/**
 * The top of the home page: a name, and the one fact about you that changes.
 *
 * Left-aligned and large, with nothing beside it. A dashboard that opens with
 * a centred greeting is a splash screen; this is the first line of a page, and
 * the line under it is the only thing that has earned a place there — the
 * streak, which is the running record of turning up and the reason the rest of
 * the page has anything personal on it at all.
 *
 * The name is a prop and not a hook. It comes from the server render, so it is
 * in the first HTML rather than appearing a beat later once Clerk's client has
 * loaded — a greeting that says "Welcome back" and then adds your name is a
 * greeting that reads as broken twice a day.
 */
export function HomeGreeting({ name }: { name: string | null }) {
  const streak = useStreak();

  const current = streak?.current ?? 0;
  const lit = current > 0;

  return (
    <div>
      <h1 className="text-display text-[2.25rem] sm:text-[2.75rem]">
        Welcome back{name ? <>, {name}</> : ""}
      </h1>

      {/* One line, and it says two things: how long the run is, and something
          about it worth hearing. `streakMessage` is the same voice the
          celebration overlay uses, so the page and the confetti agree. */}
      <div className="mt-3 flex h-6 items-center gap-2 text-[0.9375rem]">
        {streak !== null && (
          <>
            <Flame className="size-[1.125rem] shrink-0" lit={lit} />
            {lit ? (
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {streakLabel(current)}
                </span>{" "}
                in a row. {streakMessage(current, streak.best)}
              </p>
            ) : (
              <p className="text-muted-foreground">
                No streak yet. Open something today and it starts.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}