import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * The day, as this app counts one.
 *
 * Three things now key on a date — the streak, the per-account day rows, and
 * the global board — and they were three copies of the same six lines of
 * arithmetic until this file existed. It is the only place that turns an
 * instant into a `YYYY-MM-DD`, which is what keeps them from disagreeing about
 * where a day starts.
 *
 * ## Why the client sends an offset and not a date
 *
 * A personal day boundary has to be the user's local midnight: a streak
 * counted in UTC breaks at 5pm for half the world. Only the browser knows
 * which midnight that is, so it has to say — but what it sends is
 * `getTimezoneOffset()`, a number of minutes, never the date itself. The clock
 * stays the server's, so the worst a client can do by lying is move its own
 * midnight, which is the one thing it is entitled to decide. A client-supplied
 * `"2026-08-31"` would instead be a free extra day, every day.
 *
 * The global board is the deliberate exception and uses `utcDayKey`. See
 * `activityDays` in `convex/schema.ts`.
 */

/** Milliseconds in a day. Used only to step whole days. */
export const DAY_MS = 86_400_000;

/**
 * Real UTC offsets run from -12:00 to +14:00. Anything outside that is a
 * broken or hostile client, and the clamp keeps it from shifting the day key
 * far enough to matter rather than rejecting the whole call over it.
 */
export function clampOffset(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(-14 * 60, Math.min(12 * 60, Math.round(minutes)));
}

/**
 * The `YYYY-MM-DD` the given instant falls on, in the caller's local day.
 *
 * `Date.prototype.getTimezoneOffset` reports minutes *behind* UTC — UTC-5 is
 * `300` — so subtracting it slides the instant onto the caller's wall clock,
 * where `toISOString` (which is always UTC) then reads off the right date.
 */
export function dayKey(atMs: number, offsetMinutes: number): string {
  return new Date(atMs - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** The same instant as a UTC date, for the one bucket that is everybody's. */
export function utcDayKey(atMs: number): string {
  return new Date(atMs).toISOString().slice(0, 10);
}

/**
 * The `count` day keys ending at `endDay`, oldest first.
 *
 * Built by stepping the *instant* rather than by decrementing the date string,
 * because month and year ends make string arithmetic a calendar
 * implementation. Parsing back through `Date.UTC` is safe here: both ends of
 * the trip are the same fictional UTC midnight, so the offset that produced
 * the key never has to be applied again.
 */
export function dayWindow(endDay: string, count: number): string[] {
  const end = Date.parse(`${endDay}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) =>
    utcDayKey(end - (count - 1 - index) * DAY_MS),
  );
}

/** This account's row for a day, or `null`. */
export async function userDay(
  ctx: QueryCtx,
  clerkId: string,
  day: string,
) {
  return await ctx.db
    .query("userDays")
    .withIndex("byUserDay", (q) => q.eq("clerkId", clerkId).eq("day", day))
    .unique();
}

/** Every row for this account between two day keys, inclusive, oldest first. */
export async function userDaysBetween(
  ctx: QueryCtx,
  clerkId: string,
  fromDay: string,
  toDay: string,
) {
  return await ctx.db
    .query("userDays")
    .withIndex("byUserDay", (q) =>
      q.eq("clerkId", clerkId).gte("day", fromDay).lte("day", toDay),
    )
    .collect();
}

/**
 * Folds a day's worth of use into the account's row for that day, creating it
 * if this is the first thing to happen.
 *
 * Additive on purpose: every caller knows only about the increment it is
 * making, never the total, so two of them landing in the same day cannot
 * clobber each other's numbers. `visited` is the one field that latches — once
 * a day has been claimed it stays claimed, and a later view must not be able
 * to unset it by passing nothing.
 */
export async function foldUserDay(
  ctx: MutationCtx,
  clerkId: string,
  day: string,
  fold: { visited?: boolean; views?: number; seconds?: number },
): Promise<void> {
  const existing = await userDay(ctx, clerkId, day);

  if (existing === null) {
    await ctx.db.insert("userDays", {
      clerkId,
      day,
      visited: fold.visited ?? false,
      views: fold.views ?? 0,
      seconds: fold.seconds ?? 0,
    });
    return;
  }

  await ctx.db.patch(existing._id, {
    visited: existing.visited || (fold.visited ?? false),
    views: existing.views + (fold.views ?? 0),
    seconds: existing.seconds + (fold.seconds ?? 0),
  });
}

/**
 * The same, for the global board. Keyed by the UTC day rather than anyone's
 * local one — see `activityDays` in `convex/schema.ts`.
 */
export async function foldActivityDay(
  ctx: MutationCtx,
  day: string,
  slug: string,
  fold: { views?: number; seconds?: number },
): Promise<void> {
  const existing = await ctx.db
    .query("activityDays")
    .withIndex("byDayActivity", (q) => q.eq("day", day).eq("slug", slug))
    .unique();

  if (existing === null) {
    await ctx.db.insert("activityDays", {
      day,
      slug,
      views: fold.views ?? 0,
      seconds: fold.seconds ?? 0,
    });
    return;
  }

  await ctx.db.patch(existing._id, {
    views: existing.views + (fold.views ?? 0),
    seconds: existing.seconds + (fold.seconds ?? 0),
  });
}
