import { v } from "convex/values";
import {
  clampOffset,
  dayKey,
  dayWindow,
  foldUserDay,
  userDaysBetween,
  DAY_MS,
} from "./days";
import { mutation, query, type QueryCtx } from "./_generated/server";

/**
 * The daily streak: how many days in a row this account has turned up.
 *
 * The state lives on the user row (see `convex/schema.ts`), so nothing here
 * costs more than the single indexed document read the caller was already
 * doing. Two functions use it — a read that says what the streak is *now*,
 * and a write that claims today — and both derive the day the same way, from
 * `convex/days.ts`, which is also where the reasoning about local midnight and
 * the client-supplied offset lives.
 *
 * The claim additionally writes a row in `userDays`. That table is not the
 * streak — the streak is still the three fields on the user, and still needs
 * no history to be correct — it is the record of *which* days, which is what
 * the strip of seven dots on the home page draws and what the counters beside
 * it sum over.
 */

/** How many days the strip on the home page shows. */
const WEEK = 7;

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

/** One dot on the home page's strip. */
export type StreakDay = {
  /** `YYYY-MM-DD` in the caller's local day. */
  day: string;
  /** Whether the day was claimed. The last entry is today. */
  visited: boolean;
  /** Seconds spent that day, which is what makes a lit dot vary in weight. */
  seconds: number;
};

/**
 * The last seven days, oldest first, always exactly seven long.
 *
 * The missing days are filled in here rather than left for the client to
 * notice, because "did nothing on Tuesday" and "there is no Tuesday in this
 * array" draw the same dot and only one of them is a shape a component can
 * map over without guarding every index.
 *
 * Separate from `mine` rather than folded into it: `mine` is subscribed to by
 * the badge in the rail on every page of the app, and there is no reason for a
 * chip showing one number to also be watching seven rows it never draws.
 */
export const week = query({
  args: { tzOffsetMinutes: v.number() },
  handler: async (ctx, { tzOffsetMinutes }): Promise<StreakDay[]> => {
    const offset = clampOffset(tzOffsetMinutes);
    const days = dayWindow(dayKey(Date.now(), offset), WEEK);

    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return days.map((day) => ({ day, visited: false, seconds: 0 }));
    }

    const rows = await userDaysBetween(
      ctx,
      identity.subject,
      days[0],
      days[days.length - 1],
    );
    const byDay = new Map(rows.map((row) => [row.day, row]));

    return days.map((day) => {
      const row = byDay.get(day);
      return {
        day,
        visited: row?.visited ?? false,
        seconds: row?.seconds ?? 0,
      };
    });
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

    // The day's own row, so the strip has something to light. Inside the same
    // branch as the patch above, which is what keeps this at one write per day
    // rather than one per page load: every later call today returns at the
    // `streakLastDay === today` check and never reaches here.
    await foldUserDay(ctx, row.clerkId, today, { visited: true });

    return {
      current,
      best,
      countedToday: true,
      extended: true,
      deferred: false,
    };
  },
});
