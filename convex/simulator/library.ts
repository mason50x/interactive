import { ConvexError, v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { caller, owned, hash, label } from "./shared";
import { entryDoc, mode } from "./model";
import { limits } from "./limits";
export const list = query({
  args: {},
  returns: v.array(entryDoc),
  handler: async (ctx) => {
    const owner = await caller(ctx);
    // The registration cap makes this a complete, bounded library.
    return ctx.db
      .query("simulatorEntries")
      .withIndex("by_ownerClerkId_and_lastOpenedAt", (q) =>
        q.eq("ownerClerkId", owner),
      )
      .order("desc")
      .take(20);
  },
});
export const get = query({
  args: { contentHash: v.string() },
  returns: v.union(entryDoc, v.null()),
  handler: async (ctx, args) => {
    const owner = await caller(ctx);
    hash(args.contentHash);
    return ctx.db
      .query("simulatorEntries")
      .withIndex("by_ownerClerkId_and_contentHash", (q) =>
        q.eq("ownerClerkId", owner).eq("contentHash", args.contentHash),
      )
      .unique();
  },
});
export const register = mutation({
  args: { contentHash: v.string(), mode, label: v.optional(v.string()) },
  returns: entryDoc,
  handler: async (ctx, args) => {
    const owner = await caller(ctx);
    hash(args.contentHash);
    const rate = await limits.limit(ctx, "simulatorLibrary", { key: owner });
    if (!rate.ok)
      throw new ConvexError("Please wait before opening another simulation.");
    const existing = await ctx.db
      .query("simulatorEntries")
      .withIndex("by_ownerClerkId_and_contentHash", (q) =>
        q.eq("ownerClerkId", owner).eq("contentHash", args.contentHash),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      const title = existing.label === "Imported simulation" && args.label ? label(args.label) : existing.label;
      await ctx.db.patch(existing._id, { lastOpenedAt: now, label: title });
      return { ...existing, lastOpenedAt: now, label: title };
    }
    const all = await ctx.db
      .query("simulatorEntries")
      .withIndex("by_ownerClerkId_and_contentHash", (q) =>
        q.eq("ownerClerkId", owner),
      )
      .take(20);
    if (all.length >= 20)
      throw new ConvexError(
        "Your library is full. Remove an entry before adding another.",
      );
    const id = await ctx.db.insert("simulatorEntries", {
      ownerClerkId: owner,
      contentHash: args.contentHash,
      label: args.label ? label(args.label) : "Imported simulation",
      source: "imported",
      mode: args.mode,
      createdAt: now,
      lastOpenedAt: now,
      updatedAt: now,
      revision: 0,
    });
    return (await ctx.db.get(id))!;
  },
});
export const rename = mutation({
  args: { entryId: v.id("simulatorEntries"), label: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const entry = await owned(ctx, args.entryId);
    if (!entry) throw new ConvexError("Progress was deleted.");
    const rate = await limits.limit(ctx, "simulatorLibrary", {
      key: entry.ownerClerkId,
    });
    if (!rate.ok) throw new ConvexError("Please wait before renaming again.");
    await ctx.db.patch(entry._id, {
      label: label(args.label),
      updatedAt: Date.now(),
    });
    return null;
  },
});
export const remove = mutation({
  args: { entryId: v.id("simulatorEntries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const entry = await owned(ctx, args.entryId);
    if (!entry) return null;
    const saves = await ctx.db
      .query("simulatorSaves")
      .withIndex("by_entryId_and_slot", (q) => q.eq("entryId", entry._id))
      .take(5);
    for (const save of saves) await ctx.db.delete(save._id);
    await ctx.db.delete(entry._id);
    return null;
  },
});
