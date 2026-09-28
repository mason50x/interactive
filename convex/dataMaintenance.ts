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
 * Takes accounts still at the invite gate back out of chat and the live view.
 * Before the gate was enforced on the server they were seated in the default
 * rooms on sign-up, and could be opened in a DM. Their row and settings stay,
 * so they are still at the gate; `invites.redeem` seats them again. Run once
 * after deploying, then again until it returns zero.
 */
export const clearGatedAccounts = internalMutation({
  args: {},
  returns: v.number(),
  handler: async ctx => {
    let removed = 0;
    for await (const user of ctx.db.query("users")) {
      if (user.invited !== false) continue;
      const seats = await ctx.db.query("conversationMembers")
        .withIndex("byUser", q => q.eq("clerkId", user.clerkId))
        .take(BATCH);
      for (const seat of seats) {
        const conversation = await ctx.db.get(seat.conversationId);
        if (conversation?.kind === "dm") {
          // The DM has no one to talk to until they are in; take the other
          // side's seat and the conversation with it, if nothing was said.
          const said = await ctx.db.query("messages")
            .withIndex("byConversation", q => q.eq("conversationId", conversation._id))
            .first();
          if (said === null) {
            const others = await ctx.db.query("conversationMembers")
              .withIndex("byConversation", q => q.eq("conversationId", conversation._id))
              .take(BATCH);
            for (const other of others) if (other._id !== seat._id) await ctx.db.delete(other._id);
            await ctx.db.delete(conversation._id);
          }
        }
        await ctx.db.delete(seat._id);
        removed++;
      }
      const activity = await ctx.db.query("userActivity")
        .withIndex("byClerkId", q => q.eq("clerkId", user.clerkId))
        .take(BATCH);
      for (const row of activity) await ctx.db.delete(row._id);
      removed += activity.length;
    }
    return removed;
  },
});
