"use client";

import { useEffect, useState } from "react";
import { Monogram } from "@/components/app/chat/monogram";
import { BOT_HANDLE, BOT_NAME, BOT_TAGS_PER_DAY } from "@/lib/chat";
import { cn } from "@/lib/utils";

/**
 * The `@bot` allowance, drawn at the top of the composer's plus menu.
 *
 * The server hands over a token bucket as it stood at one instant, and the
 * rest is arithmetic done here so the popup can say how many are left right
 * now and when the next one is back, without asking again. See `quota` in
 * `convex/chat/bot.ts` for the bucket.
 */
export type BotQuotaState = {
  value: number;
  ts: number;
  rate: number;
  period: number;
  capacity: number;
};

/**
 * The bucket as it stands at `now`.
 *
 * `value` is what the server had at `ts`; tokens have been coming back at
 * `rate` per `period` since, up to `capacity`. Returned whole and fractional
 * both: the bar wants the fraction, the count wants the floor, and the
 * countdown wants how far the next whole one is.
 */
function botQuota(state: BotQuotaState, now: number) {
  const refilled =
    state.value + (Math.max(0, now - state.ts) * state.rate) / state.period;
  const value = Math.min(state.capacity, Math.max(0, refilled));
  const whole = Math.floor(value + 1e-9);
  const nextIn =
    value >= state.capacity
      ? 0
      : ((whole + 1 - value) * state.period) / state.rate;
  return { value, whole, nextIn };
}

/** "2h 10m", "35m", "under a minute". */
function untilLabel(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 1) return "under a minute";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * The top of the plus menu: how many `@bot` tags are left, as a bar and a
 * count, and when the next one is back.
 *
 * Ticks once a minute while it is mounted — which is only while the popup is
 * open — so a countdown that says "3m" is still true when it says it. The
 * bar's own motion is `.quota-fill` in `globals.css`.
 */
export function BotQuota({
  quota,
}: {
  quota: BotQuotaState | null | undefined;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const state = quota == null ? null : botQuota(quota, now);
  const capacity = quota?.capacity ?? BOT_TAGS_PER_DAY;
  // Whole tags, like the count beside it: a bar at 94% over "4 of 5" reads
  // as a bar that is wrong, not as a fifth token on its way back.
  const fraction = state === null ? 0 : state.whole / capacity;

  return (
    <div className="px-2.5 pt-2 pb-1.5" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span className="flex items-center gap-2 font-medium text-foreground">
          <Monogram handle={BOT_HANDLE} className="size-5 text-[0.5rem]" />
          {BOT_NAME} Usage
        </span>
        <span className="text-muted-foreground tabular-nums">
          {state === null ? "…" : `${state.whole} of ${capacity} left`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${BOT_NAME} replies left today`}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={state?.whole}
        className="mt-2 h-3 overflow-hidden rounded-full bg-foreground/[0.08]"
      >
        {/* Green, then amber, then red as it runs down: a fuel gauge, not
            the accent. Of five: four or more green, three amber, two or
            fewer red. */}
        <div
          className={cn(
            "quota-fill h-full rounded-full",
            fraction > 0.6
              ? "bg-[#22c55e]"
              : fraction > 0.4
                ? "bg-[#eab308]"
                : "bg-[#ef4444]",
          )}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      {/* Nothing to say while the allowance is full; the bar says it. */}
      {state !== null && state.nextIn === 0 ? null : (
        <p className="mt-1.5 text-center text-[0.75rem] text-muted-foreground">
          {state === null
            ? "Checking…"
            : state.whole === 0
              ? `Next one back in ${untilLabel(state.nextIn)}`
              : `One more in ${untilLabel(state.nextIn)}`}
        </p>
      )}
    </div>
  );
}
