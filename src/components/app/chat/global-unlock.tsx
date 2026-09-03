"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { untilLabel } from "@/lib/chat";

/**
 * The wait before a new account may speak to the whole room, drawn as a thing
 * filling up rather than said as a thing going wrong.
 *
 * The rule is in `convex/moderation/verdict.ts` and it is a good one — the
 * cheapest defence there is against an account made to say one thing to
 * everybody and then be abandoned. But the way it used to arrive was: type a
 * message, press send, get it handed back in red. That is a refusal, and a
 * refusal is what you show somebody who did something. Waiting fifteen minutes
 * after signing up is not something you did.
 *
 * So the wait is shown before it is hit, as a ring that fills. Nothing is typed
 * into a box that was never going to take it, nothing comes back in red, and
 * the moment the ring closes the composer is live — the same tick, no reload,
 * because the countdown and the lock read from one clock.
 *
 * ## The clock is local
 *
 * The server sends an instant (`globalUnlockAt`) and the browser counts down to
 * it. A query cannot re-run itself at a future moment, so anything that had to
 * be told by the server that the wait was over would sit there finished-looking
 * and still locked until something unrelated woke the subscription up. The cost
 * of counting locally is that a badly-set clock unlocks early or late, which is
 * why the server still checks: this is the explanation, not the enforcement.
 */

/**
 * Milliseconds left until `until`, ticking once a second, `null` before the
 * browser has a clock of its own.
 *
 * Starting at `null` rather than at a number computed during render is the same
 * arrangement `useNow` uses and is there for the same reason: a value read from
 * `Date.now()` while rendering is a value the server rendered differently, and
 * the mismatch lands on exactly the text somebody is looking at.
 *
 * `useSyncExternalStore` over a ref, rather than an interval setting state,
 * because an interval *is* an external store and React has a hook that says so
 * — and because the snapshot has to be a cached value rather than a fresh
 * `Date.now()`, which would change on every read and leave React with nothing
 * to settle on. The tick clears itself the moment it lands on zero, so a room
 * somebody sits in all afternoon is not re-rendering behind them.
 */
export function useRemaining(until: number | null): number | null {
  // One store per caller, because what is being watched is one instant and not
  // the clock — two waits would want two of these.
  const left = useRef<number | null>(null);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (until === null) {
        left.current = null;
        return () => {};
      }

      // Held in a const the hoisted declarations below can see as a number —
      // a parameter's narrowing does not reach into them.
      const target = until;

      function read(): number {
        left.current = Math.max(0, target - Date.now());
        return left.current;
      }

      function tick(): void {
        if (read() === 0) stop();
        onChange();
      }

      function stop(): void {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", tick);
      }

      // No `onChange` here: React re-reads the snapshot straight after
      // subscribing, which is what catches the jump from the server's `null` to
      // a real number on the first client pass.
      if (read() === 0) return () => {};

      const timer = setInterval(tick, 1000);

      // A backgrounded tab has its intervals throttled to about a minute, so
      // the first thing a returning tab would otherwise show is a ring that is
      // as far behind as it was away. Read once on the way back in.
      document.addEventListener("visibilitychange", tick);

      return stop;
    },
    [until],
  );

  const snapshot = useCallback(() => left.current, []);

  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Nothing on the server, which is the point. See above. */
const serverSnapshot = () => null;

/** Geometry. `r` leaves room for the stroke, which is centred on the path. */
const R = 13;
const CIRCUMFERENCE = 2 * Math.PI * R;

/**
 * One line over the composer, with a small ring beside it. It was a card with
 * a big dial and two sentences, and at that size it read as a warning about
 * something you had done. This says the one thing worth saying — when — in
 * the space of a caption, and leaves the room readable above it.
 */
export function GlobalUnlock({
  remaining,
  total,
}: {
  /** Milliseconds still to wait. */
  remaining: number;
  /** The whole wait, so the ring knows how far along it is. */
  total: number;
}) {
  const progress =
    total <= 0 ? 1 : Math.min(1, Math.max(0, 1 - remaining / total));

  return (
    <div className="mx-3 mb-2 flex items-center gap-2.5 rounded-xl bg-surface-muted px-3 py-2 sm:mx-8 lg:mx-14 xl:mx-20">
      <div
        role="progressbar"
        aria-label="Until you can post to everyone"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={untilLabel(remaining, 0) + " left"}
        className="relative size-7 shrink-0"
      >
        {/* Turned so the fill starts at twelve o'clock. */}
        <svg viewBox="0 0 30 30" className="size-full -rotate-90" aria-hidden>
          <circle
            cx="15"
            cy="15"
            r={R}
            fill="none"
            strokeWidth="3"
            className="stroke-border"
          />
          {/* One second of linear travel per tick, which is exactly the gap
              between ticks — so the arc is still moving when the next one
              lands and the whole thing reads as a sweep. */}
          <circle
            cx="15"
            cy="15"
            r={R}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            stroke="var(--primary)"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
          />
        </svg>
      </div>

      <p className="min-w-0 text-[0.8125rem] leading-snug text-muted-foreground">
        <span className="font-medium text-foreground">
          You can post to everyone in {untilLabel(remaining, 0)}.
        </span>{" "}
        Direct messages and groups are open now.
      </p>
    </div>
  );
}
