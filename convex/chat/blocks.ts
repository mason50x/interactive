import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { callerProfile, friendship, hasBlocked, profileFor } from "./shared";

/**
 * Making somebody go away.
 *
 * The one moderation tool that needs no rule, no threshold and no ladder: the
 * person best placed to decide that a particular account should stop appearing
 * is the person it is appearing to. On a system with nobody reviewing reports,
 * this is also the only remedy that is instant and certain, which is why it is
 * deliberately blunt — no confirmation flow, no "are you sure", no notifying
 * the other person that it happened.
 *
 * Blocking is directional in the table and mutual in effect: it stops them
 * reaching you and stops you seeing them. What it is not is a report. Nothing
 * here touches anybody's standing, because "somebody found you annoying" and
 * "you broke a rule" are different claims and only the second one should ever
 * cost an account.
 */

const MAX_LIST = 200;

export type Blocked = { clerkId: string; handle: string };

/**
 * Block somebody, and stop being their friend.
 *
 * The friendship goes because leaving it would be a contradiction the rest of
 * the system has to keep checking around: an accepted friendship is a standing
 * permission to open a direct message, and a block is a standing refusal. One
 * of them has to win, and it should not be the one that was granted earlier.
 */
export const block = mutation({
  args: { peerClerkId: v.string() },
  handler: async (ctx, { peerClerkId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    if (peerClerkId === profile.clerkId) return;
    if (await hasBlocked(ctx, profile.clerkId, peerClerkId)) return;

    await ctx.db.insert("blocks", {
      blocker: profile.clerkId,
      blocked: peerClerkId,
      createdAt: Date.now(),
    });

    const friends = await friendship(ctx, profile.clerkId, peerClerkId);
    if (friends !== null) await ctx.db.delete(friends._id);
  },
});

/** Undo it. The friendship does not come back; that has to be asked for again. */
export const unblock = mutation({
  args: { peerClerkId: v.string() },
  handler: async (ctx, { peerClerkId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;

    const existing = await ctx.db
      .query("blocks")
      .withIndex("byBlocker", (q) =>
        q.eq("blocker", profile.clerkId).eq("blocked", peerClerkId),
      )
      .unique();
    if (existing === null) return;
    await ctx.db.delete(existing._id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx): Promise<Blocked[]> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return [];

    const rows = await ctx.db
      .query("blocks")
      .withIndex("byBlocker", (q) => q.eq("blocker", profile.clerkId))
      .take(MAX_LIST);

    const blocked: Blocked[] = [];
    for (const row of rows) {
      const theirs = await profileFor(ctx, row.blocked);
      blocked.push({
        clerkId: row.blocked,
        // A blocked account that has since been deleted still has a row, and
        // showing it as unnamed is better than dropping it — otherwise the only
        // way to unblock is to know an id nobody can see.
        handle: theirs?.handle ?? "unknown",
      });
    }
    return blocked;
  },
});
