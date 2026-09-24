import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

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

/** Reward repeats only matter inside a 30-minute window; a day of margin, then
 * the normalized text is removed. */
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
