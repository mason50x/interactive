"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Flame } from "@/components/app/flame";
import { streakMessage } from "@/lib/streak";
import { cn } from "@/lib/utils";

/** How long the overlay holds before it takes itself away. */
const HOLD_MS = 4600;
/** Must match `streak-leave` in globals.css. */
const LEAVE_MS = 300;

/**
 * The sparks. Precomputed rather than random, so the same day's celebration
 * looks the same twice and nothing here depends on a random number generator
 * agreeing across a render boundary.
 *
 * Each ember gets three values that make it its own: where it starts across
 * the flame, how far it wanders on the way up, and how long it takes. The
 * multipliers are coprime with the count, which is all it takes for the set to
 * look scattered rather than to fall into a visible pattern.
 */
const embers = Array.from({ length: 18 }, (_, i) => ({
  left: `${18 + ((i * 29) % 64)}%`,
  drift: `${((i * 43) % 26) - 13}px`,
  end: `${((i * 71) % 60) - 30}px`,
  lift: `-${96 + ((i * 53) % 72)}px`,
  size: 2 + (i % 3),
  delay: `${(i * 197) % 2100}ms`,
  duration: `${2100 + ((i * 311) % 1500)}ms`,
}));

/** Three rings, offset in time, so the burst reads as a pulse of heat. */
const bursts = [0, 500, 1000];

/**
 * The day's claim, celebrated.
 *
 * Shown once — on the one call that moved the number, never on a subscription
 * update — so this is the only screen in the app that appears without anybody
 * asking for it. That is the whole reason it behaves the way it does: it takes
 * no focus, traps none, blocks nothing behind it that a click or the Escape
 * key cannot clear, and leaves on its own after a few seconds whether or not
 * anyone touched it. A reward that has to be dismissed is a dialog.
 *
 * `role="status"` and not `role="dialog"` for the same reason. Nothing here is
 * a question; it is an announcement, and a screen reader should hear it
 * without being moved out of whatever it was reading.
 *
 * `fixed` works because this renders from `StreakProvider`, above the
 * dashboard's own layout and outside everything that transforms — a fixed
 * child of a transformed ancestor is positioned against that ancestor instead
 * of the viewport, which is the usual way an overlay like this ends up pinned
 * to the corner of a card.
 */
export function StreakCelebration({
  streak,
  best,
  onDismiss,
}: {
  /** The number to celebrate. */
  streak: number;
  best: number;
  onDismiss: () => void;
}) {
  // Mounted only while there is something to celebrate — `StreakProvider`
  // renders nothing at all otherwise — which is what lets this start at
  // `false` and never need putting back. A component that stayed mounted and
  // returned `null` would come back for the next streak still on its way out.
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // One timer to start the exit, a second to unmount after it. Kept apart so
    // a click can start the same exit early and land on the identical motion.
    let unmount: ReturnType<typeof setTimeout>;
    const leave = setTimeout(() => {
      setLeaving(true);
      unmount = setTimeout(onDismiss, LEAVE_MS);
    }, HOLD_MS);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(leave);
      clearTimeout(unmount);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-[60] flex items-center justify-center px-6",
        leaving && "animate-streak-leave",
      )}
    >
      {/* The way out, and the whole background. A real button rather than a
          click handler on the scrim: this is the only control here, and it has
          to be reachable by a keyboard that never sees the Escape listener. */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="animate-scrim-in absolute inset-0 cursor-default bg-background/80 backdrop-blur-md"
      />

      <div className="animate-streak-enter pointer-events-none relative flex flex-col items-center">
        {/* The heat. A radial gradient scaling in place — the cheapest way to
            make something look like it is glowing, and the reason there is no
            blur filter anywhere in this overlay. */}
        <div
          aria-hidden
          className="flame-halo absolute top-1/2 left-1/2 -z-10 size-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in srgb, var(--fire) 34%, transparent), transparent)",
          }}
        />

        <div className="relative flex size-36 items-center justify-center">
          {/* Rings leaving the flame. Behind it, and pointer-transparent, so
              the flame stays the thing in focus. */}
          {bursts.map((delay) => (
            <span
              key={delay}
              aria-hidden
              className="flame-burst absolute size-24 rounded-full border border-fire/60"
              style={{ "--burst-delay": `${delay}ms` } as CSSProperties}
            />
          ))}

          <Flame className="size-24" />

          {/* Sparks. They start at the foot of the flame — `bottom-8` is where
              its base sits inside this box — and each one is given its own
              height to climb, so the column of them frays out at the top
              instead of ending on a line. */}
          <div aria-hidden className="absolute inset-0 overflow-visible">
            {embers.map((ember, i) => (
              <span
                key={i}
                className="ember absolute bottom-8 rounded-full bg-fire shadow-[0_0_4px_var(--fire)]"
                style={
                  {
                    left: ember.left,
                    width: ember.size,
                    height: ember.size,
                    "--ember-drift": ember.drift,
                    "--ember-x": ember.end,
                    "--ember-lift": ember.lift,
                    "--ember-delay": ember.delay,
                    "--ember-duration": ember.duration,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>

        <p className="text-display mt-2 text-[4.5rem] text-fire-ink tabular-nums">
          {streak}
        </p>
        <p className="mt-2 text-[1.125rem] text-foreground">
          {/* Singular `day` on purpose: it qualifies "streak" here rather
              than counting anything, so "14 days streak" would be the same
              mistake as "a two miles walk". The chip's `streakLabel` counts,
              and does take the plural. */}
          day streak
        </p>
        <p className="mt-1 text-[0.9375rem] text-muted-foreground">
          {streakMessage(streak, best)}
        </p>
      </div>
    </div>
  );
}
