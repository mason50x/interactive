import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { isCurrentPuzzle } from "./calculus";

const BATCH = 100;
const DAY = 24 * 60 * 60_000;

/** Keep timeout decisions for seven days, including their reasons. */
export const pruneTimeoutHistory = internalMutation({
  args: {},
  returns: v.number(),
  handler: async ctx => {
    const rows = await ctx.db.query("timeoutAudit")
      .withIndex("by_creation_time", q => q.lt("_creationTime", Date.now() - 7 * DAY))
      .take(BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === BATCH) await ctx.scheduler.runAfter(0, internal.dataMaintenance.pruneTimeoutHistory, {});
    return rows.length;
  },
});

/** A finished timeout needs no separate status row after its history expires. */
export const pruneInactiveTimeouts = internalMutation({
  args: {},
  returns: v.number(),
  handler: async ctx => {
    const rows = await ctx.db.query("userTimeouts")
      .withIndex("byEnabledAndUpdatedAt", q => q.eq("enabled", false).lt("updatedAt", Date.now() - 7 * DAY))
      .take(BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === BATCH) await ctx.scheduler.runAfter(0, internal.dataMaintenance.pruneInactiveTimeouts, {});
    return rows.length;
  },
});

/** Keep a day's reward history for consecutive repeat checks. */
export const pruneRewardReceipts = internalMutation({
  args: {},
  returns: v.number(),
  handler: async ctx => {
    const rows = await ctx.db.query("playtimeRewards")
      .withIndex("by_creation_time", q => q.lt("_creationTime", Date.now() - DAY))
      .take(BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === BATCH) await ctx.scheduler.runAfter(0, internal.dataMaintenance.pruneRewardReceipts, {});
    return rows.length;
  },
});

/** Current-page snapshots have no use after a month without a heartbeat. */
export const pruneUserActivity = internalMutation({
  args: {},
  returns: v.number(),
  handler: async ctx => {
    const rows = await ctx.db.query("userActivity")
      .withIndex("byLastActiveAt", q => q.lt("lastActiveAt", Date.now() - 30 * DAY))
      .take(BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === BATCH) await ctx.scheduler.runAfter(0, internal.dataMaintenance.pruneUserActivity, {});
    return rows.length;
  },
});

/**
 * One-off: rows still holding a geometry puzzle from before the switch to
 * calculus. Run it once on each deployment; once both are clean the legacy
 * half of the `timeoutPuzzles.params` union can go (see `convex/calculus.ts`).
 */
export const pruneLegacyPuzzles = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("timeoutPuzzles").paginate({ cursor: cursor ?? null, numItems: BATCH });
    let pruned = 0;
    for (const row of page.page) {
      if (isCurrentPuzzle(row.params)) continue;
      await ctx.db.delete(row._id);
      pruned++;
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.dataMaintenance.pruneLegacyPuzzles, { cursor: page.continueCursor });
    return pruned;
  },
});
