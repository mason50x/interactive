import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { caller, hash, label } from "./shared";
import { htmlDoc } from "./htmlModel";
import { limits } from "./limits";
// Metadata only: no endpoint accepts HTML, assets, or progress.
export const list = query({
  args: {},
  returns: v.array(htmlDoc),
  handler: async (ctx) => {
    const owner = await caller(ctx);
    return ctx.db
      .query("htmlSimulatorEntries")
      .withIndex("by_ownerClerkId_and_contentHash", (q) =>
        q.eq("ownerClerkId", owner),
      )
      .take(20);
  },
});
export const register = mutation({
  args: { contentHash: v.string(), label: v.string() },
  returns: htmlDoc,
  handler: async (ctx, args) => {
    const owner = await caller(ctx);
    hash(args.contentHash);
    const title = label(args.label);
    if (!(await limits.limit(ctx, "simulatorLibrary", { key: owner })).ok)
      throw new ConvexError("Please wait before opening another simulation.");
    const existing = await ctx.db
      .query("htmlSimulatorEntries")
      .withIndex("by_ownerClerkId_and_contentHash", (q) =>
        q.eq("ownerClerkId", owner).eq("contentHash", args.contentHash),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { lastOpenedAt: now });
      return { ...existing, lastOpenedAt: now };
    }
    const entries = await ctx.db
      .query("htmlSimulatorEntries")
      .withIndex("by_ownerClerkId_and_contentHash", (q) =>
        q.eq("ownerClerkId", owner),
      )
      .take(20);
    if (entries.length >= 20)
      throw new ConvexError(
        "Your HTML library is full. Remove an entry first.",
      );
    const id = await ctx.db.insert("htmlSimulatorEntries", {
      ownerClerkId: owner,
      contentHash: args.contentHash,
      label: title,
      createdAt: now,
      lastOpenedAt: now,
    });
    return (await ctx.db.get(id))!;
  },
});
export const rename = mutation({
  args: { contentHash: v.string(), label: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await caller(ctx);
    hash(args.contentHash);
    const title = label(args.label);
    if (!(await limits.limit(ctx, "simulatorLibrary", { key: owner })).ok)
      throw new ConvexError("Please wait before renaming again.");
    const entry = await ctx.db
      .query("htmlSimulatorEntries")
      .withIndex("by_ownerClerkId_and_contentHash", (q) =>
        q.eq("ownerClerkId", owner).eq("contentHash", args.contentHash),
      )
      .unique();
    if (entry) await ctx.db.patch(entry._id, { label: title });
    return null;
  },
});
export const remove = mutation({
  args: { contentHash: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await caller(ctx);
    if (args.contentHash !== undefined) {
      hash(args.contentHash);
      const entry = await ctx.db
        .query("htmlSimulatorEntries")
        .withIndex("by_ownerClerkId_and_contentHash", (q) =>
          q.eq("ownerClerkId", owner).eq("contentHash", args.contentHash!),
        )
        .unique();
      if (entry) await ctx.db.delete(entry._id);
    } else {
      const entries = await ctx.db
        .query("htmlSimulatorEntries")
        .withIndex("by_ownerClerkId_and_contentHash", (q) =>
          q.eq("ownerClerkId", owner),
        )
        .take(20);
      for (const entry of entries) await ctx.db.delete(entry._id);
    }
    return null;
  },
});
