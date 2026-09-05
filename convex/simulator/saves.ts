import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { owned, validateSave } from "./shared";
import {
  slot,
  writableSlot,
  saveDoc,
  envelopeFields,
  commitResult,
} from "./model";
import { limits } from "./limits";
const metadata = v.object({
  slot,
  captureId: v.string(),
  revision: v.number(),
  savedAt: v.number(),
  capturedAt: v.number(),
  engineBuild: v.string(),
});
export const list = query({
  args: { entryId: v.id("simulatorEntries") },
  returns: v.array(metadata),
  handler: async (ctx, args) => {
    const entry = await owned(ctx, args.entryId);
    if (!entry) return [];
    const rows = await ctx.db
      .query("simulatorSaves")
      .withIndex("by_entryId_and_slot", (q) => q.eq("entryId", entry._id))
      .take(5);
    return rows.map((s) => ({
      slot: s.slot,
      captureId: s.captureId,
      revision: s.revision,
      savedAt: s.savedAt,
      capturedAt: s.capturedAt,
      engineBuild: s.engineBuild,
    }));
  },
});
export const read = query({
  args: { entryId: v.id("simulatorEntries"), slot },
  returns: v.union(saveDoc, v.null()),
  handler: async (ctx, args) => {
    if (!(await owned(ctx, args.entryId))) return null;
    return ctx.db
      .query("simulatorSaves")
      .withIndex("by_entryId_and_slot", (q) =>
        q.eq("entryId", args.entryId).eq("slot", args.slot),
      )
      .unique();
  },
});
async function write(
  ctx: MutationCtx,
  entry: Doc<"simulatorEntries">,
  target: Doc<"simulatorSaves">["slot"],
  data: Omit<
    Doc<"simulatorSaves">,
    "_id" | "_creationTime" | "slot" | "entryId" | "ownerClerkId"
  >,
) {
  const find = (s: Doc<"simulatorSaves">["slot"]) =>
    ctx.db
      .query("simulatorSaves")
      .withIndex("by_entryId_and_slot", (q) =>
        q.eq("entryId", entry._id).eq("slot", s),
      )
      .unique();
  const current = await find(target);
  if (target === "auto" && current) {
    const previous = await find("previous");
    const { _id, _creationTime, ...fields } = current;
    void _id;
    void _creationTime;
    if (previous)
      await ctx.db.replace(previous._id, { ...fields, slot: "previous" });
    else await ctx.db.insert("simulatorSaves", { ...fields, slot: "previous" });
  }
  const fields = {
    ...data,
    entryId: entry._id,
    ownerClerkId: entry.ownerClerkId,
    slot: target,
  };
  if (current) await ctx.db.replace(current._id, fields);
  else await ctx.db.insert("simulatorSaves", fields);
  await ctx.db.patch(entry._id, {
    revision: data.revision,
    updatedAt: data.savedAt,
    latestSavedAt: data.savedAt,
    lastOpenedAt: data.savedAt,
  });
}
export const commit = mutation({
  args: {
    entryId: v.id("simulatorEntries"),
    expectedRevision: v.number(),
    slot: writableSlot,
    ...envelopeFields,
  },
  returns: commitResult,
  handler: async (ctx, args) => {
    const entry = await owned(ctx, args.entryId, true);
    if (!entry)
      return { ok: false as const, reason: "deleted" as const, revision: 0 };
    validateSave(args);
    const rows = await ctx.db
      .query("simulatorSaves")
      .withIndex("by_entryId_and_slot", (q) => q.eq("entryId", entry._id))
      .take(5);
    const duplicate = rows.find((s) => s.captureId === args.captureId);
    if (duplicate)
      return {
        ok: true as const,
        revision: duplicate.revision,
        captureId: args.captureId,
      };
    if (entry.revision !== args.expectedRevision)
      return {
        ok: false as const,
        reason: "conflict" as const,
        revision: entry.revision,
      };
    const rate = await limits.limit(ctx, "simulatorSave", {
      key: entry.ownerClerkId,
    });
    if (!rate.ok)
      return {
        ok: false as const,
        reason: "rate-limit" as const,
        revision: entry.revision,
        retryAfter: rate.retryAfter,
      };
    const { entryId, expectedRevision, slot: target, ...data } = args;
    void entryId;
    void expectedRevision;
    const revision = entry.revision + 1;
    await write(ctx, entry, target, { ...data, revision, savedAt: Date.now() });
    return { ok: true as const, revision, captureId: args.captureId };
  },
});
export const restore = mutation({
  args: {
    entryId: v.id("simulatorEntries"),
    slot,
    expectedRevision: v.number(),
    captureId: v.string(),
  },
  returns: commitResult,
  handler: async (ctx, args) => {
    const entry = await owned(ctx, args.entryId, true);
    if (!entry)
      return { ok: false as const, reason: "deleted" as const, revision: 0 };
    if (entry.revision !== args.expectedRevision)
      return {
        ok: false as const,
        reason: "conflict" as const,
        revision: entry.revision,
      };
    const source = await ctx.db
      .query("simulatorSaves")
      .withIndex("by_entryId_and_slot", (q) =>
        q.eq("entryId", entry._id).eq("slot", args.slot),
      )
      .unique();
    if (!source)
      return {
        ok: false as const,
        reason: "deleted" as const,
        revision: entry.revision,
      };
    validateSave({ ...source, captureId: args.captureId });
    const rate = await limits.limit(ctx, "simulatorSave", {
      key: entry.ownerClerkId,
    });
    if (!rate.ok)
      return {
        ok: false as const,
        reason: "rate-limit" as const,
        revision: entry.revision,
        retryAfter: rate.retryAfter,
      };
    const revision = entry.revision + 1;
    await write(ctx, entry, "auto", {
      captureId: args.captureId,
      engineBuild: source.engineBuild,
      formatVersion: source.formatVersion,
      capturedAt: source.capturedAt,
      checkpoint: source.checkpoint,
      ...(source.battery ? { battery: source.battery } : {}),
      revision,
      savedAt: Date.now(),
    });
    return { ok: true as const, revision, captureId: args.captureId };
  },
});
export const remove = mutation({
  args: {
    entryId: v.id("simulatorEntries"),
    slot,
    expectedRevision: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const entry = await owned(ctx, args.entryId);
    if (!entry || entry.revision !== args.expectedRevision) return false;
    const row = await ctx.db
      .query("simulatorSaves")
      .withIndex("by_entryId_and_slot", (q) =>
        q.eq("entryId", entry._id).eq("slot", args.slot),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
    await ctx.db.patch(entry._id, {
      revision: entry.revision + 1,
      updatedAt: Date.now(),
    });
    return true;
  },
});
