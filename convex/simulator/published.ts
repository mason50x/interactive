import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { resolveRole } from "../roles";
import { caller, label } from "./shared";
import { limits } from "./limits";
import { publishedSummary } from "./publishedModel";
import { MAX_PUBLISHED_HTML_ENTRIES, MAX_PUBLISHED_DESCRIPTION, validatePublishedHtml } from "../../config/published-html";

async function publisher(ctx: QueryCtx | MutationCtx) {
  const id = await caller(ctx);
  const role = await resolveRole(ctx, id);
  if (role !== "builder" && role !== "ceo")
    throw new ConvexError("Only Builders and CEOs can manage published HTML.");
  return id;
}
function summary(row: Doc<"publishedHtmlSimulators">) {
  return { _id: row._id, label: row.label, description: row.description, contentHash: row.contentHash, byteLength: row.byteLength, revision: row.revision, updatedAt: row.updatedAt };
}
function metadata(title: string, description: string) {
  const clean = description.trim();
  if (clean.length > MAX_PUBLISHED_DESCRIPTION || /[\x00-\x1f]/.test(clean))
    throw new ConvexError("Use a description of up to 280 characters on one line.");
  return { label: label(title), description: clean };
}
const editArgs = {
  id: v.optional(v.id("publishedHtmlSimulators")),
  expectedRevision: v.optional(v.number()),
  operationId: v.string(),
};

export const access = query({
  args: {}, returns: v.boolean(),
  handler: async (ctx) => {
    const id = await caller(ctx);
    const role = await resolveRole(ctx, id);
    return role === "builder" || role === "ceo";
  },
});
export const list = query({
  args: {}, returns: v.array(publishedSummary),
  handler: async (ctx) => {
    await caller(ctx);
    // The write path enforces a global cap, keeping this reactive grid bounded.
    return (await ctx.db.query("publishedHtmlSimulators").order("desc").take(MAX_PUBLISHED_HTML_ENTRIES)).map(summary);
  },
});
export const get = query({
  args: { id: v.string() },
  returns: v.union(v.object({ ...publishedSummary.fields, url: v.string() }), v.null()),
  handler: async (ctx, { id }) => {
    await caller(ctx);
    const normalized = ctx.db.normalizeId("publishedHtmlSimulators", id);
    if (!normalized) return null;
    const row = await ctx.db.get(normalized);
    if (!row) return null;
    const url = await ctx.storage.getUrl(row.storageId);
    return url ? { ...summary(row), url } : null;
  },
});

export const begin = internalMutation({
  args: editArgs, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await publisher(ctx);
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(args.operationId)) throw new ConvexError("Invalid publishing request.");
    if (args.id) {
      const row = await ctx.db.get(args.id);
      if (!row) throw new ConvexError("This published simulation was removed.");
      if (row.lastOperationId !== `${actor}:${args.operationId}` && row.revision !== args.expectedRevision)
        throw new ConvexError("This simulation changed. Reopen the editor before saving.");
    } else if (args.expectedRevision !== undefined) {
      throw new ConvexError("Invalid publishing revision.");
    }
    if (!(await limits.limit(ctx, "publishedHtml", { key: actor })).ok)
      throw new ConvexError("Please wait before publishing again.");
    return null;
  },
});

export const commit = internalMutation({
  args: { ...editArgs, label: v.string(), description: v.string(), storageId: v.id("_storage"), contentHash: v.string(), byteLength: v.number() },
  returns: v.id("publishedHtmlSimulators"),
  handler: async (ctx, args) => {
    // Check the live role again after upload: a demotion/timeout must win the race.
    const actor = await publisher(ctx);
    const info = metadata(args.label, args.description);
    const operation = `${actor}:${args.operationId}`;
    const row = args.id ? await ctx.db.get(args.id) : await ctx.db.query("publishedHtmlSimulators").withIndex("by_publishKey", q => q.eq("publishKey", operation)).unique();
    if (row?.lastOperationId === operation) {
      if (row.contentHash !== args.contentHash || row.label !== info.label || row.description !== info.description)
        throw new ConvexError("This request already published different content. Reopen the editor.");
      await ctx.storage.delete(args.storageId);
      return row._id;
    }
    // A delayed retry of the original publication must not undo later edits.
    if (!args.id && row) {
      await ctx.storage.delete(args.storageId);
      return row._id;
    }
    if (args.id && (!row || row.revision !== args.expectedRevision))
      throw new ConvexError("This simulation changed or was removed. Reopen the editor before saving.");
    const now = Date.now();
    if (row) {
      const unchanged = row.contentHash === args.contentHash;
      await ctx.db.patch(row._id, { ...info, storageId: unchanged ? row.storageId : args.storageId, contentHash: args.contentHash, byteLength: args.byteLength, revision: row.revision + 1, updatedBy: actor, updatedAt: now, lastOperationId: operation });
      await ctx.storage.delete(unchanged ? args.storageId : row.storageId);
      return row._id;
    }
    if ((await ctx.db.query("publishedHtmlSimulators").take(MAX_PUBLISHED_HTML_ENTRIES)).length >= MAX_PUBLISHED_HTML_ENTRIES)
      throw new ConvexError("The published library is full. Remove an entry first.");
    return ctx.db.insert("publishedHtmlSimulators", { ...info, storageId: args.storageId, contentHash: args.contentHash, byteLength: args.byteLength, revision: 1, createdBy: actor, updatedBy: actor, createdAt: now, updatedAt: now, publishKey: operation, lastOperationId: operation });
  },
});

// Re-check references if the action saw an ambiguous commit failure. Never delete
// a file that a successfully committed row now uses.
export const discard = internalMutation({
  args: { storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const used = await ctx.db.query("publishedHtmlSimulators").withIndex("by_storageId", q => q.eq("storageId", storageId)).first();
    if (!used && await ctx.db.system.get(storageId)) await ctx.storage.delete(storageId);
    return null;
  },
});
export const save = action({
  args: { ...editArgs, label: v.string(), description: v.string(), source: v.string() },
  returns: v.id("publishedHtmlSimulators"),
  handler: async (ctx, args): Promise<Doc<"publishedHtmlSimulators">["_id"]> => {
    await ctx.runMutation(internal.simulator.published.begin, { id: args.id, expectedRevision: args.expectedRevision, operationId: args.operationId });
    const info = metadata(args.label, args.description);
    let bytes: Uint8Array;
    try { bytes = validatePublishedHtml(args.source); }
    catch (e) { throw new ConvexError(e instanceof Error ? e.message : "Invalid HTML."); }
    const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
    const contentHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    // application/octet-stream prevents the storage URL from being an HTML host.
    const storageId = await ctx.storage.store(new Blob([args.source], { type: "application/octet-stream" }));
    try {
      // If execution stops before commit, reclaim the unreferenced file later.
      await ctx.scheduler.runAfter(60 * 60 * 1000, internal.simulator.published.discard, { storageId });
      return await ctx.runMutation(internal.simulator.published.commit, { ...info, id: args.id, expectedRevision: args.expectedRevision, operationId: args.operationId, storageId, contentHash, byteLength: bytes.byteLength });
    } catch (error) {
      await ctx.runMutation(internal.simulator.published.discard, { storageId });
      throw error;
    }
  },
});
export const remove = mutation({
  args: { id: v.id("publishedHtmlSimulators"), expectedRevision: v.number() }, returns: v.null(),
  handler: async (ctx, { id, expectedRevision }) => {
    await publisher(ctx);
    const row = await ctx.db.get(id);
    if (!row) return null;
    if (row.revision !== expectedRevision) throw new ConvexError("This simulation changed. Refresh before removing it.");
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(id);
    return null;
  },
});
