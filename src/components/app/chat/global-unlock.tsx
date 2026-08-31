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
const R = 23;
const CIRCUMFERENCE = 2 * Math.PI * R;

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

  // Rounded up, so it reads "1 min" for the whole of the last minute and never
  // shows a zero it is not yet acting on.
  const seconds = Math.ceil(remaining / 1000);
  const count = seconds >= 60 ? Math.ceil(seconds / 60) : seconds;
  const unit = seconds >= 60 ? "min" : "sec";

  return (
    <div className="mx-3 mb-2 flex shrink-0 items-center gap-3.5 rounded-3xl border border-border bg-surface/70 px-4 py-3 shadow-[0_6px_24px_rgba(15,15,15,0.10)] backdrop-blur-xl">
      <div
        role="progressbar"
        aria-label="Until you can post to everyone"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={untilLabel(remaining, 0) + " left"}
        className="relative size-[52px] shrink-0"
      >
        {/* Turned so the fill starts at twelve o'clock. The svg is rotated
            rather than the wrapper, which would take the number with it. */}
        <svg viewBox="0 0 52 52" className="size-full -rotate-90" aria-hidden>
          <circle
            cx="26"
            cy="26"
            r={R}
            fill="none"
            strokeWidth="4"
            className="stroke-border"
          />

          {/* One second of linear travel per tick, which is exactly the gap
              between ticks — so the arc is still moving when the next one
              lands and the whole thing reads as a sweep rather than a clock
              hand. */}
          <circle
            cx="26"
            cy="26"
            r={R}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            stroke="var(--primary)"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="text-[0.9375rem] leading-none font-semibold tabular-nums">
            {count}
          </span>
          <span className="text-[0.5625rem] leading-none text-faint">
            {unit}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-[0.9375rem] font-medium">
          New accounts wait {untilLabel(total, 0)} before posting to everyone.
        </p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
          The wait clears on its own. Direct messages and groups are open in the
          meantime.
        </p>
      </div>
    </div>
  );
}
