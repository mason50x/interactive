import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
export const purgeOwner = internalMutation({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkId }) => {
    const saves = await ctx.db
      .query("simulatorSaves")
      .withIndex("by_ownerClerkId", (q) => q.eq("ownerClerkId", clerkId))
      .take(8);
    for (const save of saves) await ctx.db.delete(save._id);
    if (saves.length === 8) {
      await ctx.scheduler.runAfter(0, internal.simulator.cleanup.purgeOwner, {
        clerkId,
      });
      return null;
    }
    const entries = await ctx.db
      .query("simulatorEntries")
      .withIndex("by_ownerClerkId_and_contentHash", (q) =>
        q.eq("ownerClerkId", clerkId),
      )
      .take(20);
    for (const entry of entries) await ctx.db.delete(entry._id);
    return null;
  },
});
