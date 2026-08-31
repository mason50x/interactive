import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";

/**
 * The daily streak: how many days in a row this account has turned up.
 *
 * The state lives on the user row (see `convex/schema.ts`), so nothing here
 * costs more than the single indexed document read the caller was already
 * doing. Two functions use it — a read that says what the streak is *now*,
 * and a write that claims today — and both derive the day the same way, from
 * the one helper below.
 *
 * ## Why the client sends an offset and not a date
 *
 * The day boundary has to be the user's local midnight: a streak counted in
 * UTC breaks at 5pm for half the world. Only the browser knows which midnight
 * that is, so it has to say — but what it sends is `getTimezoneOffset()`, a
 * number of minutes, never the date itself. The clock stays the server's, so
 * the worst a client can do by lying is move its own midnight, which is the
 * one thing it is entitled to decide. A client-supplied `"2026-08-31"` would
 * instead be a free extra day, every day.
 */

/** Milliseconds in a day. Used only to step one whole day back. */
const DAY_MS = 86_400_000;

/**
 * Real UTC offsets run from −12:00 to +14:00. Anything outside that is a
 * broken or hostile client, and the clamp keeps it from shifting the day key
 * far enough to matter rather than rejecting the whole call over it.
 */
function clampOffset(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  return Math.max(-14 * 60, Math.min(12 * 60, Math.round(minutes)));
}

/**
 * The `YYYY-MM-DD` the given instant falls on, in the caller's local day.
 *
 * `Date.prototype.getTimezoneOffset` reports minutes *behind* UTC — UTC−5 is
 * `300` — so subtracting it slides the instant onto the caller's wall clock,
 * where `toISOString` (which is always UTC) then reads off the right date.
 */
function dayKey(atMs: number, offsetMinutes: number): string {
  return new Date(atMs - offsetMinutes * 60_000).toISOString().slice(0, 10);
}

async function callerRow(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  return await ctx.db
    .query("users")
    .withIndex("byClerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

/** What the badge draws. Shared by the query and the mutation's return. */
export type Streak = {
  /** Days in a row as of right now — `0` once a streak has lapsed. */
  current: number;
  /** The longest run this account has ever had. */
  best: number;
  /** Whether today is already counted, which it is after the first visit. */
  countedToday: boolean;
};

const NO_STREAK: Streak = { current: 0, best: 0, countedToday: false };

/**
 * Turns the three stored fields into the two numbers a reader wants.
 *
 * This is the "calculated" half, and it is why a lapse needs no cron to sweep
 * it up: a streak whose last day is neither today nor yesterday is simply read
 * as zero, whatever the stored count says. Yesterday still counts as alive —
 * the day is not over until it is over, and a streak that vanished at midnight
 * and came back on the next page load would look like a bug.
 */
function resolve(
  row: { streakCount?: number; streakBest?: number; streakLastDay?: string },
  nowMs: number,
  offsetMinutes: number,
): Streak {
  const best = row.streakBest ?? 0;
  const last = row.streakLastDay;
  if (last === undefined) return { ...NO_STREAK, best };

  const today = dayKey(nowMs, offsetMinutes);
  const yesterday = dayKey(nowMs - DAY_MS, offsetMinutes);
  const alive = last === today || last === yesterday;

  return {
    current: alive ? (row.streakCount ?? 0) : 0,
    best,
    countedToday: last === today,
  };
}

/**
 * The signed-in caller's streak.
 *
 * A subscription, so the badge lights up the moment `claimToday` lands rather
 * than on the next navigation. Signed-out callers and accounts whose row has
 * not been written yet both get the zero streak: neither is an error, and
 * giving them one shape saves every reader a branch.
 */
export const mine = query({
  args: { tzOffsetMinutes: v.number() },
  handler: async (ctx, { tzOffsetMinutes }): Promise<Streak> => {
    const row = await callerRow(ctx);
    if (row === null) return NO_STREAK;
    return resolve(row, Date.now(), clampOffset(tzOffsetMinutes));
  },
});

/**
 * What a claim tells the client.
 *
 * `extended` is the whole celebration protocol. Only the call that actually
 * moved the number gets it, so the client can throw confetti without keeping a
 * "have I already celebrated today" flag anywhere — the server has one, and it
 * is the row itself.
 *
 * `deferred` is the other outcome that is not a failure: there was no user row
 * to count against. It is separate from `extended: false` because the two ask
 * for opposite things — one means the day is already claimed and there is
 * nothing more to do, the other means nothing was claimed and asking again
 * shortly will work.
 */
export type ClaimResult = Streak & { extended: boolean; deferred: boolean };

/**
 * Counts today, and says whether doing so extended the streak.
 *
 * Called once when the app shell mounts. Every call after the first on a given
 * day finds `streakLastDay` already equal to today and returns without
 * writing, which is what keeps this at one write per user per day no matter
 * how many tabs, navigations or remounts happen in between.
 */
export const claimToday = mutation({
  args: { tzOffsetMinutes: v.number() },
  handler: async (ctx, { tzOffsetMinutes }): Promise<ClaimResult> => {
    const row = await callerRow(ctx);
    // No row yet means `StoreUser`'s upsert has not landed — the two mount
    // together on a first ever sign-in. Nothing to write to, and nothing here
    // can fix it, so say so and let the caller ask again.
    if (row === null) {
      return { ...NO_STREAK, extended: false, deferred: true };
    }

    const offset = clampOffset(tzOffsetMinutes);
    const now = Date.now();
    const today = dayKey(now, offset);

    if (row.streakLastDay === today) {
      return { ...resolve(row, now, offset), extended: false, deferred: false };
    }

    // Yesterday continues the run; anything else — a gap, or a first ever
    // visit — starts a new one at today.
    const yesterday = dayKey(now - DAY_MS, offset);
    const current =
      row.streakLastDay === yesterday ? (row.streakCount ?? 0) + 1 : 1;
    const best = Math.max(row.streakBest ?? 0, current);

    await ctx.db.patch(row._id, {
      streakCount: current,
      streakBest: best,
      streakLastDay: today,
    });

    return {
      current,
      best,
      countedToday: true,
      extended: true,
      deferred: false,
    };
  },
});
