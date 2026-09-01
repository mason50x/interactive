import { v } from "convex/values";
import {
  clampOffset,
  dayKey,
  dayWindow,
  foldUserDay,
  weekWindow,
  userDaysBetween,
  DAY_MS,
} from "./days";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

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
 * it sum over. It only reaches back as far as its own first write, though — it
 * was added mid-streak for everybody who was already here — so the strip reads
 * the count as well (`runDays`) and the claim writes the difference back
 * (`healRun`).
 */

/** Days in a week: the length of the strip, and how far back anything reads. */
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
  /** Whether the account turned up — a claimed day, or a day the streak
   *  count vouches for. */
  visited: boolean;
  /**
   * Whether this is the caller's today, and so where the drawn week stops
   * being history and starts being days that have not happened.
   *
   * Sent rather than worked out in the component. The window was built from
   * the caller's offset on this side, and having the client re-derive its own
   * date to find itself in the row would be two answers to one question — the
   * one that renders and the one that was counted — differing by a midnight
   * for anybody with the page open across one.
   */
  today: boolean;
  /** Seconds spent that day, which is what makes a lit dot vary in weight. */
  seconds: number;
};

/**
 * The days the stored streak already asserts, oldest first.
 *
 * The count on the user row and the rows in `userDays` are two records of the
 * same fact, and they did not have to agree: `userDays` only started being
 * written when the table was added, and the claim writes one row — the day it
 * runs on — and never the days behind it. Every day of a run that predates the
 * table was therefore a day the streak counted and the table had never heard
 * of, which is a card reading "3 days" over a chain with one link in it.
 *
 * So the count speaks for its own days. `streakCount` days ending at
 * `streakLastDay` were, by the definition of the number, days this account
 * turned up. Clipping to `WEEK` is only because that is the whole window
 * anything reads — the strip draws seven days and the stats card sums seven,
 * so a run longer than that has no reader to be wrong in front of.
 *
 * Both sides use this. `week` unions it over the rows so the card is
 * self-consistent on the first frame whatever the table holds, and `healRun`
 * writes the rows it names so the table stops needing to be corrected. The
 * read is the invariant; the write is what makes the read stop mattering.
 *
 * A lapsed streak is included on purpose. Its last days are still days that
 * happened, and the chain's job is the shape of the week — including a run
 * that ended in the middle of it.
 */
function runDays(row: {
  streakCount?: number;
  streakLastDay?: string;
}): string[] {
  const last = row.streakLastDay;
  const count = row.streakCount ?? 0;
  if (last === undefined || count < 1) return [];
  return dayWindow(last, Math.min(count, WEEK));
}

/**
 * Writes the `userDays` rows the streak count implies and the table is missing.
 *
 * Called from the claim, on the one call a day that moves the number, so the
 * cost is a single range read per account per day and — after the first pass —
 * no writes at all. That is the whole reason this is here rather than in a
 * migration somebody has to remember to run against each deployment: the gap
 * closes itself for anybody who turns up, and stays closed.
 *
 * `visited` latches in `foldUserDay`, so this cannot overwrite a day's views or
 * seconds, and re-running it is a no-op. Today's row has already been written
 * by the time this is called and reads back inside the same transaction, which
 * is why it needs no special case.
 *
 * It reaches back `WEEK` days at most. A run longer than that keeps its older
 * rows missing, which is correct in the only sense that matters: nothing reads
 * past seven days, and inventing rows for a window with no reader would be
 * writing history to nobody.
 */
async function healRun(
  ctx: MutationCtx,
  clerkId: string,
  today: string,
  count: number,
): Promise<void> {
  const days = runDays({ streakCount: count, streakLastDay: today });
  // One day is today, and the claim has already written it.
  if (days.length < 2) return;

  const rows = await userDaysBetween(
    ctx,
    clerkId,
    days[0],
    days[days.length - 1],
  );
  const claimed = new Set(
    rows.filter((row) => row.visited).map((row) => row.day),
  );

  for (const day of days) {
    if (claimed.has(day)) continue;
    await foldUserDay(ctx, clerkId, day, { visited: true });
  }
}

/**
 * This Monday-to-Sunday week, oldest first, always exactly seven long.
 *
 * A calendar week and not the seven days behind you — see `weekWindow` in
 * `convex/days.ts` for why the columns are worth holding still. What it means
 * here is that the row runs past today: on a Tuesday, Wednesday through Sunday
 * are days that have not happened, and they come back `visited: false` like a
 * missed day does. `today` is what tells the two apart, and drawing them apart
 * is the component's job.
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
    const today = dayKey(Date.now(), offset);
    const days = weekWindow(today);

    const user = await callerRow(ctx);
    if (user === null) {
      return days.map((day) => ({
        day,
        visited: false,
        today: day === today,
        seconds: 0,
      }));
    }

    // Only as far as today. The rest of the week has no rows in it by
    // definition, and asking the index for them is a wider range for nothing.
    const rows = await userDaysBetween(ctx, user.clerkId, days[0], today);
    const byDay = new Map(rows.map((row) => [row.day, row]));
    const run = new Set(runDays(user));

    return days.map((day) => {
      const row = byDay.get(day);
      return {
        day,
        visited: (row?.visited ?? false) || run.has(day),
        today: day === today,
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

    // And the days behind it that the table never recorded — see `healRun`.
    // Same branch, same reason: once a day, and nothing to write once the run
    // is whole.
    await healRun(ctx, row.clerkId, today, current);

    return {
      current,
      best,
      countedToday: true,
      extended: true,
      deferred: false,
    };
  },
});
